/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { VisualXmlSerializerNode } from "./serializer/VisualXmlSerializerNode";

export function activate(extensionContext: vscode.ExtensionContext) {
	extensionContext.subscriptions.push(
		vscode.window.registerCustomEditorProvider(
			"xml.visualEditor",
			new VisualEditorProvider(extensionContext),
		),
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

		const serializer = new VisualXmlSerializerNode();

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
								const model = serializer.deserialize(xml);
								// include the current color theme so the webview can render correctly
								const isDark = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark;
								try { webviewPanel.webview.postMessage({ type: "init", content: model.content, theme: isDark ? 'dark' : 'light' }); } catch (err) { /* ignore */ }

								// notify the webview if the theme changes while the panel is open
								try {
									const themeListener = vscode.window.onDidChangeActiveColorTheme((t) => {
										const nowDark = t.kind === vscode.ColorThemeKind.Dark;
										try { webviewPanel.webview.postMessage({ type: 'theme', theme: nowDark ? 'dark' : 'light' }); } catch { }
									});
									this.context.subscriptions.push(themeListener);
								} catch { /* ignore */ }
							} catch (err) {
								console.error('Failed to read file or post init', err);
							}
							break;
						}
						case "edit": {
							try {
								const incoming = e.content as string;
								try { output.appendLine('webview -> edit (received)'); } catch { }
								const model = serializer.deserialize(incoming);
								const serialized = serializer.serialize(model);
								const edit = new vscode.WorkspaceEdit();
								edit.replace(document.uri, new vscode.Range(0, 0, 9999, 9999), serialized);
								await vscode.workspace.applyEdit(edit);
								try { output.appendLine('applyEdit invoked'); } catch { }
							} catch (err) {
								console.error('Error applying edit from webview', err);
								try { output.appendLine('applyEdit failed: ' + String(err)); } catch { }
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
		cancellation: vscode.CancellationToken,
	): Thenable<void> {
		// For now, delegate to saveAs which currently reads/writes the same content.
		return this.saveCustomDocumentAs(document, document.uri, cancellation);
	}

	public saveCustomDocumentAs(
		document: VisualXmlDocument,
		destination: vscode.Uri,
		cancellation: vscode.CancellationToken,
	): Thenable<void> {
		// This is a simplified save implementation. In a real-world scenario, you would
		// get the content from the webview and save it to the file.
		// For now, we'll just read the document and write it back to the new location.
		// Read existing file, serialize via serializer and write to destination.
		const serializer = new VisualXmlSerializerNode();
		return vscode.workspace.fs.readFile(document.uri).then((data) => {
			const xml = new TextDecoder().decode(data);
			const model = serializer.deserialize(xml);
			const serialized = serializer.serialize(model);
			return vscode.workspace.fs.writeFile(
				destination,
				Buffer.from(serialized, "utf8"),
			);
		});
	}

	public revertCustomDocument(
		document: VisualXmlDocument,
		cancellation: vscode.CancellationToken,
	): Thenable<void> {
		// Revert to the file on disk.
		return vscode.workspace.fs
			.readFile(document.uri)
			.then((data: Uint8Array) => {
				// This is a simplified revert. A real implementation would send the content
				// back to the webview to update its state.
				return;
			});
	}

	public backupCustomDocument(
		document: VisualXmlDocument,
		context: vscode.CustomDocumentBackupContext,
		cancellation: vscode.CancellationToken,
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

		return /* html */ `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Visual XML Editor</title>
                <link rel="stylesheet" href="${styleUri}">
            </head>
            <body>
                <div id="root"></div>
                <script src="${scriptUri}"></script>
            </body>
            </html>`;
	}
}
