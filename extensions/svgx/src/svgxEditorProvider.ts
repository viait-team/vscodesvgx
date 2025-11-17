/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// svgxEditorProvider.ts

import * as vscode from 'vscode';
import { SvgxDocument } from './svgxDocument';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

export class SvgxEditorProvider implements vscode.CustomEditorProvider<SvgxDocument> {

	public static register(context: vscode.ExtensionContext): vscode.Disposable {
		console.log('SVGX Extension: Registering SvgxEditorProvider');

		// --- FIX: Instantiate the provider first ---
		const provider = new SvgxEditorProvider(context);

		// --- FIX: Commands now call instance methods on the provider ---
		const copyCommand = vscode.commands.registerCommand('svgx.copyLogical', () => {
			provider.copyLogical(); // Call instance method
		});
		context.subscriptions.push(copyCommand);

		const pasteCommand = vscode.commands.registerCommand('svgx.pasteLogical', async () => {
			await provider.pasteLogical(); // Call instance method
		});
		context.subscriptions.push(pasteCommand);

		const encodeCommand = vscode.commands.registerCommand('svgx.encodePathLegend', () => {
			provider.encodePathLegend(); // Call the new instance method
		});
		context.subscriptions.push(encodeCommand);

		const providerRegistration = vscode.window.registerCustomEditorProvider(SvgxEditorProvider.viewType, provider, {
			webviewOptions: {
				retainContextWhenHidden: true,
			},
			supportsMultipleEditorsPerDocument: false,
		});

		console.log('SVGX Extension: SvgxEditorProvider registered successfully');
		return vscode.Disposable.from(providerRegistration, copyCommand, pasteCommand, encodeCommand);
	}

	private static readonly viewType = 'svgx.editor';

	// --- REMOVED: The flawed static variable is gone. ---
	// private static activeWebviewPanel: vscode.WebviewPanel | undefined;

	// --- ADDED: A collection to hold all active webview panels managed by this provider. ---
	private readonly webviewPanels = new Set<vscode.WebviewPanel>();

	constructor(
		private readonly context: vscode.ExtensionContext,
	) { }

	// --- ADDED: Instance method to find the active panel and execute the copy command ---
	private copyLogical(): void {
		const activePanel = Array.from(this.webviewPanels).find(panel => panel.active);
		if (activePanel) {
			console.log('SVGX CL 1/8: CopyLogical Command is invoked...');
			console.log('SVGX CL 2/8: Sending getCopyDataRequest to active webview...');
			activePanel.webview.postMessage({ type: 'getCopyDataRequest' });
		} else {
			console.error('SVGX Error: "Copy Logical" triggered, but no active SVGX webview was found.');
		}
	}

	// --- ADDED: Instance method to find the active panel and execute the paste command ---
	private async pasteLogical(): Promise<void> {
		const activePanel = Array.from(this.webviewPanels).find(panel => panel.active);
		if (activePanel) {
			console.log('SVGX PL 1/8: PasteLogical Command is invoked...');
			console.log('SVGX PL 2/8: Sending pasteDataRequest to active webview...');
			try {
				const clipboardText = await vscode.env.clipboard.readText();
				const clipboardData = JSON.parse(clipboardText);

				if (clipboardData.source === 'svgx-logical-copy') {
					activePanel.webview.postMessage({
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
	}

	private encodePathLegend(): void {
		const activePanel = Array.from(this.webviewPanels).find(panel => panel.active);
		if (activePanel) {
			console.log('SVGX EPL 1/2: encodePathLegend Command invoked...');
			activePanel.webview.postMessage({ type: 'encodePathLegendRequest' });
		} else {
			vscode.window.showWarningMessage('No active SVGX editor to run Encode Path Legend.');
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
		// --- FIX: Add the new panel to our collection and manage its lifecycle. ---
		this.webviewPanels.add(webviewPanel);

		webviewPanel.onDidDispose(() => {
			this.webviewPanels.delete(webviewPanel);
		});

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
						this._updateDocument(document, e.payload, webviewPanel);
					}
					return;
			}
		});
	}

	private _updateDocument(document: SvgxDocument, newSvgString: string, webviewPanel: vscode.WebviewPanel) {
		const newDom = new DOMParser().parseFromString(newSvgString, 'application/xml');
		document.update(newDom);

		this._onDidChangeCustomDocument.fire({
			document,
			undo: async () => {
				const restoredDom = document.undo();
				if (restoredDom) {
					const content = new XMLSerializer().serializeToString(restoredDom);
					webviewPanel.webview.postMessage({ type: 'update', text: content });
				}
			},
			redo: async () => {
				const restoredDom = document.redo();
				if (restoredDom) {
					const content = new XMLSerializer().serializeToString(restoredDom);
					webviewPanel.webview.postMessage({ type: 'update', text: content });
				}
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
		const dom = new DOMParser().parseFromString(new TextDecoder().decode(diskContent), 'application/xml');
		document.update(dom);
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
