/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { VisualXmlSerializerNode } from './serializer/VisualXmlSerializerNode';

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(vscode.window.registerCustomEditorProvider(
		'xml.visualEditor',
		new VisualEditorProvider(context)
	));
}

interface WebviewMessage {
	type: string;
	[key: string]: any;
}

class VisualXmlDocument implements vscode.CustomDocument {
	constructor(public readonly uri: vscode.Uri) { }
	dispose(): void { }
}

class VisualEditorProvider implements vscode.CustomEditorProvider<VisualXmlDocument> {

	private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<vscode.CustomDocumentEditEvent<VisualXmlDocument>>();
	public readonly onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;

	constructor(
		private readonly context: vscode.ExtensionContext
	) { }

	public openCustomDocument(uri: vscode.Uri): VisualXmlDocument {
		return new VisualXmlDocument(uri);
	}

	public resolveCustomEditor(document: VisualXmlDocument, webviewPanel: vscode.WebviewPanel): void {
		webviewPanel.webview.options = {
			enableScripts: true,
		};
		webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

		const serializer = new VisualXmlSerializerNode();

		// Handle messages from the webview
		webviewPanel.webview.onDidReceiveMessage((e: WebviewMessage) => {
			switch (e.type) {
				case 'ready':
					vscode.workspace.fs.readFile(document.uri).then((data: Uint8Array) => {
						const xml = new TextDecoder().decode(data);
						const model = serializer.deserialize(xml);
						webviewPanel.webview.postMessage({
							type: 'init',
							content: model.content
						});
					});
					return;
				case 'edit': {
					// Apply the incoming raw content using serializer
					const incoming = e.content as string;
					const model = serializer.deserialize(incoming);
					const serialized = serializer.serialize(model);
					const edit = new vscode.WorkspaceEdit();
					edit.replace(document.uri, new vscode.Range(0, 0, 9999, 9999), serialized);
					vscode.workspace.applyEdit(edit);
					return;
				}
			}
		});
	}

	public saveCustomDocument(document: VisualXmlDocument, cancellation: vscode.CancellationToken): Thenable<void> {
		// For now, delegate to saveAs which currently reads/writes the same content.
		return this.saveCustomDocumentAs(document, document.uri, cancellation);
	}

	public saveCustomDocumentAs(document: VisualXmlDocument, destination: vscode.Uri, cancellation: vscode.CancellationToken): Thenable<void> {
		// This is a simplified save implementation. In a real-world scenario, you would
		// get the content from the webview and save it to the file.
		// For now, we'll just read the document and write it back to the new location.
		// Read existing file, serialize via serializer and write to destination.
		const serializer = new VisualXmlSerializerNode();
		return vscode.workspace.fs.readFile(document.uri).then(data => {
			const xml = new TextDecoder().decode(data);
			const model = serializer.deserialize(xml);
			const serialized = serializer.serialize(model);
			return vscode.workspace.fs.writeFile(destination, Buffer.from(serialized, 'utf8'));
		});
	}

	public revertCustomDocument(document: VisualXmlDocument, cancellation: vscode.CancellationToken): Thenable<void> {
		// Revert to the file on disk.
		return vscode.workspace.fs.readFile(document.uri).then((data: Uint8Array) => {
			// This is a simplified revert. A real implementation would send the content
			// back to the webview to update its state.
			return;
		});
	}

	public backupCustomDocument(document: VisualXmlDocument, context: vscode.CustomDocumentBackupContext, cancellation: vscode.CancellationToken): Thenable<vscode.CustomDocumentBackup> {
		// A real implementation would save a backup of the file.
		return Promise.resolve({
			id: context.destination.toString(),
			delete: () => {
				try {
					vscode.workspace.fs.delete(context.destination);
				} catch {
					// noop
				}
			}
		});
	}


	private getHtmlForWebview(webview: vscode.Webview): string {
		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(
			this.context.extensionUri, 'webview', 'main.js'));

		const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(
			this.context.extensionUri, 'webview', 'style.css'));

		return /* html */`
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
