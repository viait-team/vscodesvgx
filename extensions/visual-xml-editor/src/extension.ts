/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { VisualXmlSerializerNode } from "./serializer/VisualXmlSerializerNode";
import { processWebviewMessage } from "./webviewMessageAdapter";
import { XmlPreviewManager } from "./preview/previewManager";
import { ShowXmlPreviewCommand } from "./commands/showPreview";
import { OpenInBrowserCommand } from "./commands/openInBrowser";

export function activate(extensionContext: vscode.ExtensionContext) {
	const previewManager = new XmlPreviewManager(extensionContext);

	extensionContext.subscriptions.push(
		vscode.window.registerCustomEditorProvider(
			"xml.visualEditor",
			new VisualEditorProvider(extensionContext),
		),
	);

	const showPreviewCommand = new ShowXmlPreviewCommand(previewManager);
	extensionContext.subscriptions.push(
		vscode.commands.registerCommand("xml.showPreview", () => showPreviewCommand.execute(false)),
		vscode.commands.registerCommand("xml.showPreviewToSide", () => showPreviewCommand.execute(true)),
	);

	const openInBrowserCommand = new OpenInBrowserCommand(previewManager);
	extensionContext.subscriptions.push(
		vscode.commands.registerCommand("xml.openInBrowser", () => openInBrowserCommand.execute()),
	);

	extensionContext.subscriptions.push(
		vscode.window.registerWebviewPanelSerializer("xml.preview", previewManager),
	);
}

interface WebviewMessage {
	type: string;
	[key: string]: any;
}

class VisualXmlDocument implements vscode.CustomDocument {
	constructor(public readonly uri: vscode.Uri) { }
	dispose(): void { }
}

class VisualEditorProvider
	implements vscode.CustomEditorProvider<VisualXmlDocument> {
	private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<
		vscode.CustomDocumentEditEvent<VisualXmlDocument>
	>();
	public readonly onDidChangeCustomDocument =
		this._onDidChangeCustomDocument.event;

	constructor(private readonly context: vscode.ExtensionContext) { }

	public openCustomDocument(uri: vscode.Uri): VisualXmlDocument {
		return new VisualXmlDocument(uri);
	}

	public resolveCustomEditor(
		document: VisualXmlDocument,
		webviewPanel: vscode.WebviewPanel,
	): void {
		webviewPanel.webview.options = {
			enableScripts: true,
		};
		webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

		const serializer = new VisualXmlSerializerNode(this.context);

		const output = vscode.window.createOutputChannel('Visual XML Editor');
		this.context.subscriptions.push(output);

		// Minimal, best-effort error logging into workspace/.vxe-logs/devhost.log
		const appendErrorLog = (msg: string) => {
			try {
				const roots = vscode.workspace.workspaceFolders;
				let base: vscode.Uri | undefined = undefined;
				if (roots && roots.length > 0) { base = roots[0].uri; }
				if (!base) { return; }
				const logDir = vscode.Uri.joinPath(base, '.vxe-logs');
				const logFile = vscode.Uri.joinPath(logDir, 'devhost.log');
				const line = (new Date()).toISOString() + ' - ' + msg + '\n';
				const data = new TextEncoder().encode(line);
				vscode.workspace.fs.createDirectory(logDir).then(() => {
					vscode.workspace.fs.stat(logFile).then(() => {
						vscode.workspace.fs.readFile(logFile).then((old) => {
							const merged = new Uint8Array(old.length + data.length);
							merged.set(old, 0);
							merged.set(data, old.length);
							vscode.workspace.fs.writeFile(logFile, merged);
						});
					}, () => {
						vscode.workspace.fs.writeFile(logFile, data);
					});
				});
			} catch {
				// best-effort, ignore
			}
		};

		// Handle messages from the webview. Keep it concise and defensive.
		let panelAlive = true;
		const messageHandler = webviewPanel.webview.onDidReceiveMessage((e: WebviewMessage) => {
			// handle messages asynchronously to avoid race conditions during dispose
			setTimeout(async () => {
				if (!panelAlive) { try { output.appendLine('webview message ignored; panel disposing'); } catch { } return; }
				try {
					switch (e.type) {
						case "ready": {
							try {
								const data = await vscode.workspace.fs.readFile(document.uri);
								const xml = new TextDecoder().decode(data);
								// Prefer sending the raw XML to the webview for initial render. The webview
								// uses DOMParser to parse XML; passing the original text avoids potential
								// re-serialization differences that can produce parse errors in the webview.
								// keep serializer available for future messages, but don't re-serialize here
								// include the current color theme and experimental flag so the webview can opt in
								const isDark = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark;
								// Enable the two-panel UI by default for the new design.
								const twoPanel = true;
								// Send the original XML text for initialization to avoid DOMParser producing
								// an HTML <parsererror> document when given altered/re-serialized input.
								try { webviewPanel.webview.postMessage({ type: "init", content: xml, theme: isDark ? "dark" : "light", experimentalTwoPanel: twoPanel }); output.appendLine('visual-xml-editor: init posted (experimentalTwoPanel=' + String(twoPanel) + ')'); } catch (err) { /* ignore */ }

								// notify the webview if the theme changes while the panel is open
								try {
									const themeListener = vscode.window.onDidChangeActiveColorTheme((t) => {
										const nowDark = t.kind === vscode.ColorThemeKind.Dark;
										try { webviewPanel.webview.postMessage({ type: "theme", theme: nowDark ? "dark" : "light" }); } catch { }
									});
									this.context.subscriptions.push(themeListener);
								} catch { /* ignore */ }
							} catch (err) {
								console.error('Failed to read file or post init', err);
							}
							break;
						}
						case "edit":
						case "incremental":
						case "fullDocument":
						case "requestSave": {
							// Delegate to adapter which knows how to handle both full and future incremental messages
							try {
								await processWebviewMessage(e, document, webviewPanel, serializer, output, this.context);
							} catch (err) {
								console.error('adapter processing failed', err);
							}
							break;
						}
						case "debug": {
							try {
								const text = 'webview: ' + (e.msg || JSON.stringify(e));
								output.appendLine(text);
								appendErrorLog(text);
							} catch { }
							break;
						}
					}
				} catch (err) {
					console.error('webview message handler failed', err);
				}
			}, 0);
		});

		// Dispose the message handler when panel is closed to avoid receiving messages after shutdown
		webviewPanel.onDidDispose(() => {
			panelAlive = false;
			try { messageHandler.dispose(); } catch { /* noop */ }
		});
	}

	public saveCustomDocument(
		document: VisualXmlDocument,
		_cancellation: vscode.CancellationToken,
	): Thenable<void> {
		// For now, delegate to saveAs which currently reads/writes the same content.
		return this.saveCustomDocumentAs(document, document.uri, _cancellation);
	}

	public saveCustomDocumentAs(
		document: VisualXmlDocument,
		destination: vscode.Uri,
		_cancellation: vscode.CancellationToken,
	): Thenable<void> {
		// This is a simplified save implementation. In a real-world scenario, you would
		// get the content from the webview and save it to the file.
		// For now, we'll just read the document and write it back to the new location.
		// Read existing file, serialize via serializer and write to destination.
		const serializer = new VisualXmlSerializerNode(this.context);
		return (async () => {
			const data = await vscode.workspace.fs.readFile(document.uri);
			const xml = new TextDecoder().decode(data);
			const model = await serializer.deserialize(xml);
			const serialized = await serializer.serialize(model);
			return vscode.workspace.fs.writeFile(
				destination,
				Buffer.from(serialized, 'utf8'),
			);
		})();
	}

	public revertCustomDocument(
		document: VisualXmlDocument,
		_cancellation: vscode.CancellationToken,
	): Thenable<void> {
		// Revert to the file on disk.
		return vscode.workspace.fs
			.readFile(document.uri)
			.then((_data: Uint8Array) => {
				// This is a simplified revert. A real implementation would send the content
				// back to the webview to update its state.
				return;
			});
	}

	public backupCustomDocument(
		_document: VisualXmlDocument,
		context: vscode.CustomDocumentBackupContext,
		_cancellation: vscode.CancellationToken,
	): Thenable<vscode.CustomDocumentBackup> {
		// A real implementation would save a backup of the file.
		return Promise.resolve({
			id: context.destination.toString(),
			delete: () => {
				try {
					vscode.workspace.fs.delete(context.destination);
				} catch {
					// noop
				}
			},
		});
	}

	private getHtmlForWebview(webview: vscode.Webview): string {
		const scriptUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.context.extensionUri, "webview", "main.js"),
		);

		const styleUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.context.extensionUri, "webview", "style.css"),
		);

		// Try to expose VS Code codicon styles from the product sources so webview can use exact icons
		const codiconCssLocal = vscode.Uri.joinPath(this.context.extensionUri, '..', '..', 'src', 'vs', 'base', 'browser', 'ui', 'codicons', 'codicon', 'codicon.css');
		let codiconUri: vscode.Uri | undefined = undefined;
		try {
			codiconUri = webview.asWebviewUri(codiconCssLocal);
		} catch {
			codiconUri = undefined;
		}

		return /* html */ `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Visual XML Editor</title>
				<link rel="stylesheet" href="${styleUri}">
				${codiconUri ? `<link rel="stylesheet" href="${codiconUri}">` : ''}
            </head>
            <body>
                <div id="root"></div>
                <script src="${scriptUri}"></script>
            </body>
            </html>`;
	}
}
