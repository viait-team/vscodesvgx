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
export function activate(extensionContext) {
    const previewManager = new XmlPreviewManager(extensionContext);
    extensionContext.subscriptions.push(vscode.window.registerCustomEditorProvider("xml.visualEditor", new VisualEditorProvider(extensionContext)));
    const showPreviewCommand = new ShowXmlPreviewCommand(previewManager);
    extensionContext.subscriptions.push(vscode.commands.registerCommand("xml.showPreview", () => showPreviewCommand.execute(false)), vscode.commands.registerCommand("xml.showPreviewToSide", () => showPreviewCommand.execute(true)));
    const openInBrowserCommand = new OpenInBrowserCommand(previewManager);
    extensionContext.subscriptions.push(vscode.commands.registerCommand("xml.openInBrowser", (args) => openInBrowserCommand.execute(args)));
    // Add SVG selection synchronization commands
    extensionContext.subscriptions.push(vscode.commands.registerCommand("xml.syncEditorToPreview", () => syncEditorToPreview(previewManager)), vscode.commands.registerCommand("xml.syncPreviewToEditor", () => syncPreviewToEditor(previewManager)));
    // AUTOMATIC: Listen for editor selection changes and sync to preview automatically
    extensionContext.subscriptions.push(vscode.window.onDidChangeTextEditorSelection((event) => {
        // Only sync for SVG/XML files
        if (event.textEditor.document.languageId === 'xml' ||
            event.textEditor.document.fileName.endsWith('.svg')) {
            autoSyncEditorToPreview(previewManager, event.textEditor, event.selections[0]);
        }
    }));
    extensionContext.subscriptions.push(vscode.window.registerWebviewPanelSerializer("xml.preview", previewManager));
}
// AUTOMATIC synchronization when editor selection changes
function autoSyncEditorToPreview(previewManager, editor, selection) {
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
// Synchronization functions for bi-directional editor-preview communication
function syncEditorToPreview(previewManager) {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
        vscode.window.showWarningMessage('No active editor found');
        return;
    }
    const preview = previewManager.getActivePreview(activeEditor.document.uri);
    if (!preview?.activePreview) {
        vscode.window.showWarningMessage('No active preview found for this document. Open an SVG/XML preview first.');
        return;
    }
    // Get current editor selection
    const selection = activeEditor.selection;
    const selectedText = activeEditor.document.getText(selection);
    if (!selectedText.trim()) {
        vscode.window.showWarningMessage('No text selected. Please select an SVG/XML element to highlight in the preview.');
        return;
    }
    // Parse the selected text to find SVG/XML elements
    const elementInfo = parseSelectedElement(selectedText);
    if (elementInfo) {
        // Flash/highlight the element in preview
        preview.activePreview.highlightElementInPreview(elementInfo);
        const elementDescription = elementInfo.id
            ? `<${elementInfo.tagName}> with ID "${elementInfo.id}"`
            : elementInfo.className
                ? `<${elementInfo.tagName}> with class "${elementInfo.className}"`
                : `<${elementInfo.tagName}>`;
        vscode.window.showInformationMessage(`Highlighted ${elementDescription} in preview`);
    }
    else {
        vscode.window.showWarningMessage('No valid SVG/XML element found in selection. Please select a complete element like <circle cx="50" cy="50" r="10" />');
    }
}
function parseSelectedElement(selectedText) {
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
    const keyAttributes = {};
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
function extractAttribute(attributes, attrName, keyAttributes) {
    const match = attributes.match(new RegExp(`${attrName}\\s*=\\s*["']([^"']+)["']`));
    if (match) {
        keyAttributes[attrName] = match[1];
    }
}
function syncPreviewToEditor(previewManager) {
    const currentPreview = previewManager.getCurrentlyActiveWebviewPreview();
    if (!currentPreview) {
        vscode.window.showWarningMessage('No active preview found. Open an SVG/XML preview first.');
        return;
    }
    // Send message to preview to sync current selection to editor
    currentPreview.preview.activePreview?.sendMessageToWebview({
        type: 'requestCurrentSelection'
    });
    vscode.window.showInformationMessage('Click an element in the preview to select it in the editor...');
}
class VisualXmlDocument {
    constructor(uri) {
        this.uri = uri;
    }
    dispose() { }
}
class VisualEditorProvider {
    constructor(context) {
        this.context = context;
        this._onDidChangeCustomDocument = new vscode.EventEmitter();
        this.onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;
    }
    openCustomDocument(uri) {
        return new VisualXmlDocument(uri);
    }
    resolveCustomEditor(document, webviewPanel) {
        webviewPanel.webview.options = {
            enableScripts: true,
        };
        webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);
        const serializer = new VisualXmlSerializerNode(this.context);
        const output = vscode.window.createOutputChannel('Visual XML Editor');
        this.context.subscriptions.push(output);
        // Minimal, best-effort error logging into workspace/.vxe-logs/devhost.log
        const appendErrorLog = (msg) => {
            try {
                const roots = vscode.workspace.workspaceFolders;
                let base = undefined;
                if (roots && roots.length > 0) {
                    base = roots[0].uri;
                }
                if (!base) {
                    return;
                }
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
            }
            catch {
                // best-effort, ignore
            }
        };
        // Handle messages from the webview. Keep it concise and defensive.
        let panelAlive = true;
        const messageHandler = webviewPanel.webview.onDidReceiveMessage((e) => {
            // handle messages asynchronously to avoid race conditions during dispose
            setTimeout(async () => {
                if (!panelAlive) {
                    try {
                        output.appendLine('webview message ignored; panel disposing');
                    }
                    catch { }
                    return;
                }
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
                                try {
                                    webviewPanel.webview.postMessage({ type: "init", content: xml, theme: isDark ? "dark" : "light", experimentalTwoPanel: twoPanel });
                                    output.appendLine('visual-xml-editor: init posted (experimentalTwoPanel=' + String(twoPanel) + ')');
                                }
                                catch (err) { /* ignore */ }
                                // notify the webview if the theme changes while the panel is open
                                try {
                                    const themeListener = vscode.window.onDidChangeActiveColorTheme((t) => {
                                        const nowDark = t.kind === vscode.ColorThemeKind.Dark;
                                        try {
                                            webviewPanel.webview.postMessage({ type: "theme", theme: nowDark ? "dark" : "light" });
                                        }
                                        catch { }
                                    });
                                    this.context.subscriptions.push(themeListener);
                                }
                                catch { /* ignore */ }
                            }
                            catch (err) {
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
                            }
                            catch (err) {
                                console.error('adapter processing failed', err);
                            }
                            break;
                        }
                        case "debug": {
                            try {
                                const text = 'webview: ' + (e.msg || JSON.stringify(e));
                                output.appendLine(text);
                                appendErrorLog(text);
                            }
                            catch { }
                            break;
                        }
                    }
                }
                catch (err) {
                    console.error('webview message handler failed', err);
                }
            }, 0);
        });
        // Dispose the message handler when panel is closed to avoid receiving messages after shutdown
        webviewPanel.onDidDispose(() => {
            panelAlive = false;
            try {
                messageHandler.dispose();
            }
            catch { /* noop */ }
        });
    }
    saveCustomDocument(document, _cancellation) {
        // For now, delegate to saveAs which currently reads/writes the same content.
        return this.saveCustomDocumentAs(document, document.uri, _cancellation);
    }
    saveCustomDocumentAs(document, destination, _cancellation) {
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
            return vscode.workspace.fs.writeFile(destination, Buffer.from(serialized, 'utf8'));
        })();
    }
    revertCustomDocument(document, _cancellation) {
        // Revert to the file on disk.
        return vscode.workspace.fs
            .readFile(document.uri)
            .then((_data) => {
            // This is a simplified revert. A real implementation would send the content
            // back to the webview to update its state.
            return;
        });
    }
    backupCustomDocument(_document, context, _cancellation) {
        // A real implementation would save a backup of the file.
        return Promise.resolve({
            id: context.destination.toString(),
            delete: () => {
                try {
                    vscode.workspace.fs.delete(context.destination);
                }
                catch {
                    // noop
                }
            },
        });
    }
    getHtmlForWebview(webview) {
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "webview", "main.js"));
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "webview", "style.css"));
        // Try to expose VS Code codicon styles from the product sources so webview can use exact icons
        const codiconCssLocal = vscode.Uri.joinPath(this.context.extensionUri, '..', '..', 'src', 'vs', 'base', 'browser', 'ui', 'codicons', 'codicon', 'codicon.css');
        let codiconUri = undefined;
        try {
            codiconUri = webview.asWebviewUri(codiconCssLocal);
        }
        catch {
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
