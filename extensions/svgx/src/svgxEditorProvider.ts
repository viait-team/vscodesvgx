/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// svgxEditorProvider.ts

import * as vscode from 'vscode';
import { SvgxDocument } from './svgxDocument';
import { DOMParser } from '@xmldom/xmldom';
// import { SvgxClipboardService } from './svgxClipboardService';
// import { SvgxClipboardData } from './types';

export class SvgxEditorProvider implements vscode.CustomEditorProvider<SvgxDocument> {

	public static register(context: vscode.ExtensionContext): vscode.Disposable {
		console.log('SVGX Extension: Registering SvgxEditorProvider');

		// --- FIX: The command handlers are now simplified and directly use the static activeWebviewPanel ---
		const copyCommand = vscode.commands.registerCommand('svgx.copyLogical', () => {
			if (SvgxEditorProvider.activeWebviewPanel) {
				console.log('SVGX CL 1/8: CopyLogical Command is invoked...');
				console.log('SVGX CL 2/8: Sending getCopyDataRequest to active webview...');
				SvgxEditorProvider.activeWebviewPanel.webview.postMessage({ type: 'getCopyDataRequest' });
			} else {
				console.error('SVGX Error: "Copy Logical" triggered, but no active SVGX webview was found.');
			}
		});
		context.subscriptions.push(copyCommand);

		const pasteCommand = vscode.commands.registerCommand('svgx.pasteLogical', async () => {
			if (SvgxEditorProvider.activeWebviewPanel) {
				console.log('SVGX PL 1/8: PasteLogical Command is invoked...');
				console.log('SVGX PL 2/8: Sending pasteDataRequest to active webview...');

				try {
					const clipboardText = await vscode.env.clipboard.readText();
					const clipboardData = JSON.parse(clipboardText);

					if (clipboardData.source === 'svgx-logical-copy') {
						SvgxEditorProvider.activeWebviewPanel.webview.postMessage({
							type: 'pasteDataRequest',
							payload: clipboardData
						});
					}
				} catch {
					// Ignore if clipboard is empty or not valid JSON
				}
			} else {
				console.warn('SVGX: Paste called but no active webview or logical data was found.');
			}
		});
		context.subscriptions.push(pasteCommand);
		// --- END FIX ---

		// const provider = new SvgxEditorProvider(context, clipboardService);
		const provider = new SvgxEditorProvider(context);
		const providerRegistration = vscode.window.registerCustomEditorProvider(SvgxEditorProvider.viewType, provider, {
			webviewOptions: {
				retainContextWhenHidden: true,
			},
			supportsMultipleEditorsPerDocument: false,
		});

		console.log('SVGX Extension: SvgxEditorProvider registered successfully');
		return vscode.Disposable.from(providerRegistration, copyCommand, pasteCommand);
	}

	private static readonly viewType = 'svgx.editor';
	// --- FIX: Directly track the active webview panel, not the provider or text editor ---
	private static activeWebviewPanel: vscode.WebviewPanel | undefined;
	// --- END FIX ---

	constructor(
		private readonly context: vscode.ExtensionContext,
		// private readonly _clipboardService: SvgxClipboardService
	) { }

	// --- REMOVED: The _copyLogical and _pasteLogical instance methods are no longer needed,
	// as the logic is now self-contained in the static command registration.

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

		// SvgxEditorProvider.activeWebviewPanel = webviewPanel;

		// --- FIX: Use onDidChangeViewState to reliably track the active panel ---
		webviewPanel.onDidChangeViewState(e => {
			if (e.webviewPanel.active) {
				SvgxEditorProvider.activeWebviewPanel = e.webviewPanel;
			}
		});
		webviewPanel.onDidDispose(() => {
			if (SvgxEditorProvider.activeWebviewPanel === webviewPanel) {
				SvgxEditorProvider.activeWebviewPanel = undefined;
			}
		});
		// --- END FIX ---

		// Setup webview
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
						vscode.env.clipboard.writeText(JSON.stringify(e.payload, null, 2));
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


	private _updateDocument(document: SvgxDocument, newSvgString: string) {
		// Update the internal DOM object of your custom document.
		(document as any)._dom = new DOMParser().parseFromString(newSvgString, 'application/xml');

		// Fire the event to notify VS Code that the document has been edited.
		// This is the correct way to make the document "dirty".
		this._onDidChangeCustomDocument.fire({
			document,
			// undo/redo can be implemented later if needed
			undo: async () => { /* no-op */ },
			redo: async () => { /* no-op */ },
		});
	}

	private _makeEdit(document: SvgxDocument, newContent: string) {
		const newDom = new DOMParser().parseFromString(newContent, 'application/xml');
		(document as any)._dom = newDom;

		this._onDidChangeCustomDocument.fire({
			document,
			undo: async () => { /* Not implemented */ },
			redo: async () => { /* Not implemented */ },
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
