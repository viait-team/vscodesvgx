/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// svgxEditorProvider.ts

import * as vscode from 'vscode';
import { SvgxDocument } from './svgxDocument';
import { DOMParser } from '@xmldom/xmldom';
import { SvgxClipboardService } from './svgxClipboardService'; // --- SVGX: Import clipboard service
import { SvgxClipboardData } from './types'; // --- SVGX: Import data types

export class SvgxEditorProvider implements vscode.CustomEditorProvider<SvgxDocument> {

	public static register(context: vscode.ExtensionContext, clipboardService: SvgxClipboardService): vscode.Disposable {
		console.log('SVGX Extension: Registering SvgxEditorProvider');

		const copyCommand = vscode.commands.registerCommand('svgx.copyLogical', () => {
			if (SvgxEditorProvider.activeEditorProvider) {
				SvgxEditorProvider.activeEditorProvider._copyLogical();
			}
		});
		context.subscriptions.push(copyCommand);

		const pasteCommand = vscode.commands.registerCommand('svgx.pasteLogical', () => {
			if (SvgxEditorProvider.activeEditorProvider) {
				SvgxEditorProvider.activeEditorProvider._pasteLogical();
			}
		});
		context.subscriptions.push(pasteCommand);

		const provider = new SvgxEditorProvider(context, clipboardService);
		const providerRegistration = vscode.window.registerCustomEditorProvider(SvgxEditorProvider.viewType, provider, {
			webviewOptions: {
				retainContextWhenHidden: true,
			},
			supportsMultipleEditorsPerDocument: false,
		});

		context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(() => {
			if (vscode.window.activeTextEditor?.document.uri.fsPath.endsWith('.svgx')) {
				SvgxEditorProvider.activeEditorProvider = provider;
			}
		}));

		console.log('SVGX Extension: SvgxEditorProvider registered successfully');
		return vscode.Disposable.from(providerRegistration, copyCommand, pasteCommand);
	}

	private static readonly viewType = 'svgx.editor';
	private static activeEditorProvider: SvgxEditorProvider | undefined;

	private readonly _webviews = new Map<string, vscode.WebviewPanel>();

	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly _clipboardService: SvgxClipboardService
	) { }

	private _copyLogical(): void {
		const activeDocumentUri = vscode.window.activeTextEditor?.document.uri.toString();
		if (!activeDocumentUri) { return; }

		const webviewPanel = this._webviews.get(activeDocumentUri);
		if (webviewPanel) {
			console.log('SVGX: Sending getCopyDataRequest to webview...');
			webviewPanel.webview.postMessage({ type: 'getCopyDataRequest' });
		}
	}

	private _pasteLogical(): void {
		const activeDocumentUri = vscode.window.activeTextEditor?.document.uri.toString();
		if (!activeDocumentUri) { return; }

		const webviewPanel = this._webviews.get(activeDocumentUri);
		if (webviewPanel && this._clipboardService.hasData()) {
			console.log('SVGX: Sending pasteDataRequest to webview...');
			webviewPanel.webview.postMessage({
				type: 'pasteDataRequest',
				payload: this._clipboardService.getData()
			});
		} else {
			console.warn('SVGX: Paste called but no logical data found in clipboard service.');
		}
	}


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
		this._webviews.set(document.uri.toString(), webviewPanel);
		webviewPanel.onDidDispose(() => this._webviews.delete(document.uri.toString()));
		SvgxEditorProvider.activeEditorProvider = this;

		webviewPanel.webview.options = {
			enableScripts: true,
		};
		webviewPanel.webview.html = await this.getHtmlForWebview(webviewPanel.webview);

		webviewPanel.webview.onDidReceiveMessage(e => {
			switch (e.type) {
				case 'ready': {
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

				case 'copyDataResponse':
					if (e.payload) {
						this._clipboardService.setData(e.payload as SvgxClipboardData);
						vscode.window.showInformationMessage('SVGX: Logical data copied.');
					} else {
						vscode.window.showWarningMessage('SVGX: Nothing selected to copy.');
					}
					return;

				case 'documentUpdate':
					if (e.payload) {
						this._updateDocument(document, e.payload);
					}
					return;
			}
		});
	}

	// --- SVGX: Corrected to calculate lineCount ---
	private _updateDocument(document: SvgxDocument, newSvgString: string) {
		const edit = new vscode.WorkspaceEdit();
		// Get the content from the document model to determine its line count.
		const currentContent = new TextDecoder().decode(document.documentData);
		const lineCount = currentContent.split('\n').length;

		edit.replace(
			document.uri,
			new vscode.Range(0, 0, lineCount, 0), // Replace the entire document range
			newSvgString
		);
		vscode.workspace.applyEdit(edit); // This is an undoable operation
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
		// --- SVGX: Nonce removed in the previewWebview.html for default CSP policy ---
		// It is not used currently, but we kept here for future reference.
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

		const cancellationListener = cancellation.onCancellationRequested(() => { /* no-op */ });

		try {
			await this.saveCustomDocumentAs(document, context.destination, cancellation);
		} finally {
			// This is the critical step: we dispose of the listener we created.
			cancellationListener.dispose();
		}

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
