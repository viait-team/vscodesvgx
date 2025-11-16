/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// extension.ts
import * as vscode from "vscode";
import { VisualXmlSerializerNode } from "./serializer/VisualXmlSerializerNode";
import { processWebviewMessage } from "./webviewMessageAdapter";
import { XmlPreviewManager } from "./preview/previewManager";
import { ShowXmlPreviewCommand } from "./commands/showPreview";
import { OpenInBrowserCommand } from "./commands/openInBrowser";

export function activate(extensionContext: vscode.ExtensionContext) {
	const previewManager = new XmlPreviewManager(extensionContext);
	const editorProvider = new VisualEditorProvider(extensionContext, previewManager);

	previewManager.setEditorProvider(editorProvider);

	extensionContext.subscriptions.push(
		vscode.window.registerCustomEditorProvider(
			"xml.visualEditor",
			editorProvider,
		),
	);

	const showPreviewCommand = new ShowXmlPreviewCommand(previewManager);
	extensionContext.subscriptions.push(
		vscode.commands.registerCommand("xml.showPreview", () => showPreviewCommand.execute(false)),
		vscode.commands.registerCommand("xml.showPreviewToSide", () => showPreviewCommand.execute(true)),
	);

	const openInBrowserCommand = new OpenInBrowserCommand(previewManager);
	extensionContext.subscriptions.push(
		vscode.commands.registerCommand("xml.openInBrowser", (args?: any) => openInBrowserCommand.execute(args)),
	);

	// AUTOMATIC: Listen for editor selection changes and sync to preview automatically
	extensionContext.subscriptions.push(
		vscode.window.onDidChangeTextEditorSelection((event) => {
			// Only sync for SVG/XML files
			if (event.textEditor.document.languageId === 'xml' ||
				event.textEditor.document.fileName.endsWith('.svg') ||
				event.textEditor.document.fileName.endsWith('.svgx')) {
				autoSyncEditorToPreview(previewManager, event.textEditor, event.selections[0]);
			}
		})
	);

	extensionContext.subscriptions.push(
		vscode.window.registerWebviewPanelSerializer("xml.preview", previewManager),
	);
}

// AUTOMATIC synchronization when editor selection changes
function autoSyncEditorToPreview(previewManager: XmlPreviewManager, editor: vscode.TextEditor, selection: vscode.Selection) {
	// Only proceed if there's an actual selection (not just cursor position)
	if (selection.isEmpty) {
		return;
	}

	const preview = previewManager.getActivePreview(editor.document.uri);
	if (!preview?.activePreview) {
		return; // No preview open, silently skip
	}

	// Get selected text
	const selectedText = editor.document.getText(selection);
	if (!selectedText.trim()) {
		return;
	}

	// Parse the selected text to find SVG/XML elements
	const elementInfo = parseSelectedElement(selectedText);
	if (elementInfo) {
		// Automatically flash the element in preview using D3.js
		preview.activePreview.highlightElementInPreview(elementInfo);
	}
}

function parseSelectedElement(selectedText: string): { tagName: string; id?: string; className?: string; keyAttributes?: Record<string, string> } | null {
	// Clean up the selected text
	const cleanText = selectedText.trim();
	if (!cleanText) {
		return null;
	}

	// Match opening tag with attributes
	const tagMatch = cleanText.match(/<(\w+)(\s[^>]*)?(?:\/>|>)/);
	if (!tagMatch) {
		return null;
	}

	const tagName = tagMatch[1];
	const attributes = tagMatch[2] || '';

	// Extract ID (most important)
	const idMatch = attributes.match(/id\s*=\s*["']([^"']+)["']/);
	const id = idMatch ? idMatch[1] : undefined;

	// Extract class
	const classMatch = attributes.match(/class\s*=\s*["']([^"']+)["']/);
	const className = classMatch ? classMatch[1] : undefined;

	// Extract key attributes for matching when no ID
	const keyAttributes: Record<string, string> = {};
	if (!id) {
		// For common SVG elements, extract identifying attributes
		switch (tagName.toLowerCase()) {
			case 'circle':
				extractAttribute(attributes, 'cx', keyAttributes);
				extractAttribute(attributes, 'cy', keyAttributes);
				extractAttribute(attributes, 'r', keyAttributes);
				break;
			case 'rect':
				extractAttribute(attributes, 'x', keyAttributes);
				extractAttribute(attributes, 'y', keyAttributes);
				extractAttribute(attributes, 'width', keyAttributes);
				extractAttribute(attributes, 'height', keyAttributes);
				break;
			case 'path':
				extractAttribute(attributes, 'd', keyAttributes);
				break;
			case 'polygon':
				extractAttribute(attributes, 'points', keyAttributes);
				break;
		}
	}

	return { tagName, id, className, keyAttributes };
}

function extractAttribute(attributes: string, attrName: string, keyAttributes: Record<string, string>): void {
	const match = attributes.match(new RegExp(`${attrName}\\s*=\\s*["']([^"']+)["']`));
	if (match) {
		keyAttributes[attrName] = match[1];
	}
}

interface WebviewMessage {
	type: string;
	[key: string]: any;
}

class VisualXmlDocument implements vscode.CustomDocument {
	private _content: string = '';
	private _isDirty: boolean = false;

	constructor(public readonly uri: vscode.Uri) { }

	public get content(): string {
		return this._content;
	}

	public setContent(content: string): void {
		this._content = content;
		this._isDirty = true;
	}

	public get isDirty(): boolean {
		return this._isDirty;
	}

	public markSaved(): void {
		this._isDirty = false;
	}

	dispose(): void { }
}

class VisualEditorProvider
	implements vscode.CustomEditorProvider<VisualXmlDocument> {
	private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<
		vscode.CustomDocumentEditEvent<VisualXmlDocument>
	>();
	public readonly onDidChangeCustomDocument =
		this._onDidChangeCustomDocument.event;

	private readonly webviewPanels = new Map<string, vscode.WebviewPanel>();

	constructor(private readonly context: vscode.ExtensionContext, private readonly previewManager: XmlPreviewManager) { }

	public getWebviewPanel(uri: vscode.Uri): vscode.WebviewPanel | undefined {
		return this.webviewPanels.get(uri.toString());
	}

	public openCustomDocument(uri: vscode.Uri): VisualXmlDocument {
		return new VisualXmlDocument(uri);
	}

	public resolveCustomEditor(
		document: VisualXmlDocument,
		webviewPanel: vscode.WebviewPanel,
	): void {
		this.webviewPanels.set(document.uri.toString(), webviewPanel);
		webviewPanel.onDidDispose(() => {
			this.webviewPanels.delete(document.uri.toString());
		});

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

								// =================================================================================
								// SMARTSENSE MODIFICATION: Load the JSON store and send it to the webview.
								// =================================================================================
								try {
									const intellisenseUri = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'attributeValues.json');
									const intellisenseData = await vscode.workspace.fs.readFile(intellisenseUri);
									const jsonData = JSON.parse(new TextDecoder().decode(intellisenseData));
									webviewPanel.webview.postMessage({ type: "initIntellisense", data: jsonData });
								} catch (err) {
									console.error('Failed to load or send intellisense data:', err);
									output.appendLine('Smartsense: Failed to initialize - ' + (err as Error).message);
								}
								// =================================================================================
								// SMARTSENSE MODIFICATION: Load the attribute and element name stores.
								// =================================================================================
								try {
									const attributeNamesUri = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'attributeNames.json');
									const attributeNamesData = await vscode.workspace.fs.readFile(attributeNamesUri);
									const attributeNamesJson = JSON.parse(new TextDecoder().decode(attributeNamesData));
									webviewPanel.webview.postMessage({ type: "initAttributeNames", data: attributeNamesJson });

									const elementNamesUri = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'elementNames.json');
									const elementNamesData = await vscode.workspace.fs.readFile(elementNamesUri);
									const elementNamesJson = JSON.parse(new TextDecoder().decode(elementNamesData));
									webviewPanel.webview.postMessage({ type: "initElementNames", data: elementNamesJson });

								} catch (err) {
									console.error('Failed to load Smartsense name stores:', err);
									output.appendLine('Smartsense: Failed to initialize name stores - ' + (err as Error).message);
								}
								// =================================================================================

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

						case "attributeChange": {
							// Handle attributeChange messages from the editor webview and forward them to the preview webview.
							console.log(`AC: [3/8] Extension: Received Attribute Change message from editor webview`);
							try {
								// Find the active preview panel associated with the current document.
								const preview = this.previewManager.getActivePreview(document.uri);

								// Check if the preview and its active panel exist.
								if (preview?.activePreview) {
									console.log(`AC: [4/8] Extension: Forwarding attribute change message to preview manager`);
									// Forward the entire message object to the preview panel.
									// The preview panel will have its own logic to handle this message.
									preview.activePreview.sendAttributeUpdate(e);
								} else {
									console.warn('attributeChange: No active preview found for document URI:', document.uri.toString());
								}
							} catch (err) {
								console.error('Failed to forward attributeChange message to preview:', err);
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
						case "syncToPreview": {
							// Handle automatic sync from visual XML editor to preview
							console.log(`EP: [3/8] Extension: Received highlight message from editor webview`);
							try {
								const elementInfo = e.data;
								if (elementInfo) {
									console.log(`EP: [4/8] Extension: Forwarding highlight message to preview manager`);
									// Find the preview for this document
									const preview = this.previewManager.getActivePreview(document.uri);
									if (preview?.activePreview) {
										// Flash/highlight the element in preview
										preview.activePreview.highlightElementInPreview(elementInfo);
									}
								}
							} catch (err) {
								console.error('syncToPreview failed', err);
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
		return this.saveCustomDocumentAs(document, document.uri, _cancellation);
	}

	public saveCustomDocumentAs(
		document: VisualXmlDocument,
		destination: vscode.Uri,
		_cancellation: vscode.CancellationToken,
	): Thenable<void> {
		// Use the current content from the document if available, otherwise read from disk
		// const serializer = new VisualXmlSerializerNode(this.context);
		return (async () => {
			let content = document.content;

			if (!content) {
				// Fallback: read from disk if no content is stored
				const data = await vscode.workspace.fs.readFile(document.uri);
				content = new TextDecoder().decode(data);
			}

			// Directly save the content from the document
			await vscode.workspace.fs.writeFile(
				destination,
				Buffer.from(content, 'utf8'),
			);

			// Mark document as saved
			document.markSaved();
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
			vscode.Uri.joinPath(this.context.extensionUri, "media", "webview.js"),
		);

		const styleUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.context.extensionUri, "media", "style.css"),
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
