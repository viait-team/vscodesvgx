/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { SvgxDocument } from './svgxDocument';
import { DOMParser } from '@xmldom/xmldom';


export class SvgxEditorProvider implements vscode.CustomEditorProvider<SvgxDocument> {

	public static register(context: vscode.ExtensionContext): vscode.Disposable {
		console.log('SVGX Extension: Registering SvgxEditorProvider');
		const provider = new SvgxEditorProvider(context);
		const disposable = vscode.window.registerCustomEditorProvider(SvgxEditorProvider.viewType, provider, {
			webviewOptions: {
				retainContextWhenHidden: true,
			},
			supportsMultipleEditorsPerDocument: false,
		});
		console.log('SVGX Extension: SvgxEditorProvider registered successfully');
		return disposable;
	}

	private static readonly viewType = 'svgx.editor';

	constructor(
		private readonly context: vscode.ExtensionContext
	) { }

	async openCustomDocument(
		uri: vscode.Uri,
		_openContext: { backupId?: string },
		_token: vscode.CancellationToken
	): Promise<SvgxDocument> {
		const data = await this.readFile(uri);
		return await SvgxDocument.create(uri, data);
	}

	async resolveCustomEditor(
		document: SvgxDocument,
		webviewPanel: vscode.WebviewPanel,
		_token: vscode.CancellationToken
	): Promise<void> {
		// Setup webview
		webviewPanel.webview.options = {
			enableScripts: true,
		};
		webviewPanel.webview.html = await this.getHtmlForWebview(webviewPanel.webview);

		// Handle messages from the webview
		webviewPanel.webview.onDidReceiveMessage(e => {
			switch (e.type) {
				case 'ready': {
					// Send initial content when webview is ready (like Visual XML Editor)
					const xml = new TextDecoder().decode(document.documentData);
					const isDark = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark;
					webviewPanel.webview.postMessage({
						type: 'update',
						text: xml,
						theme: isDark ? 'dark' : 'light'
					});
					return;
				}
				case 'edit':
					this._makeEdit(document, e.content);
					return;
			}
		});
	}

	private _makeEdit(document: SvgxDocument, newContent: string) {
		const newDom = new DOMParser().parseFromString(newContent, 'application/xml');
		(document as any)._dom = newDom;

		this._onDidChangeCustomDocument.fire({
			document,
			undo: async () => {
				// Not implemented
			},
			redo: async () => {
				// Not implemented
			},
		});
	}

	private async getHtmlForWebview(webview: vscode.Webview): Promise<string> {
		const nonce = getNonce();
		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(
			this.context.extensionUri, 'media', 'svgxWebview.js'));

		const htmlUri = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'editor.html');
		let htmlContent = await vscode.workspace.fs.readFile(htmlUri).then(buffer => new TextDecoder().decode(buffer));

		htmlContent = htmlContent
			.replace(/{{nonce}}/g, nonce)
			.replace('{{scriptUri}}', scriptUri.toString());

		return htmlContent;
	}

	private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<vscode.CustomDocumentEditEvent<SvgxDocument>>();
	public readonly onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;

	public async saveCustomDocument(document: SvgxDocument, cancellation: vscode.CancellationToken): Promise<void> {
		await this.saveCustomDocumentAs(document, document.uri, cancellation);
	}

	public async saveCustomDocumentAs(document: SvgxDocument, destination: vscode.Uri, _cancellation: vscode.CancellationToken): Promise<void> {
		const newContent = document.documentData;
		await vscode.workspace.fs.writeFile(destination, newContent);
	}

	public async revertCustomDocument(document: SvgxDocument, _cancellation: vscode.CancellationToken): Promise<void> {
		const diskContent = await vscode.workspace.fs.readFile(document.uri);
		(document as any)._dom = new DOMParser().parseFromString(new TextDecoder().decode(diskContent), 'application/xml');
	}

	public async backupCustomDocument(document: SvgxDocument, context: vscode.CustomDocumentBackupContext, cancellation: vscode.CancellationToken): Promise<vscode.CustomDocumentBackup> {
		await this.saveCustomDocumentAs(document, context.destination, cancellation);
		return {
			id: context.destination.toString(),
			delete: async () => {
				try {
					await vscode.workspace.fs.delete(context.destination);
				} catch {
					// noop
				}
			}
		};
	}

	private async readFile(uri: vscode.Uri): Promise<Uint8Array> {
		if (uri.scheme === 'untitled') {
			return new Uint8Array();
		}
		return vscode.workspace.fs.readFile(uri);
	}
}

function getNonce() {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 64; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}
