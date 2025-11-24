/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { XmlDocumentRenderer } from './documentRenderer';

class XmlPreview {
	private readonly _webviewPanel: vscode.WebviewPanel;
	private _document: vscode.TextDocument | undefined;
	private readonly _renderer: XmlDocumentRenderer;
	private readonly _disposables: vscode.Disposable[] = [];
	private readonly _editorProvider: any;

	constructor(webviewPanel: vscode.WebviewPanel, document: vscode.TextDocument, editorProvider: any, context: vscode.ExtensionContext) {
		this._webviewPanel = webviewPanel;
		this._document = document;
		this._editorProvider = editorProvider;
		this._renderer = new XmlDocumentRenderer(context);

		this._webviewPanel.onDidDispose(() => {
			this.dispose();
		}, null, this._disposables);

		vscode.workspace.onDidChangeTextDocument(e => {
			if (e.document === this._document) {
				// this.update();
			}
		}, null, this._disposables);

		// Handle messages from the webview
		this._webviewPanel.webview.onDidReceiveMessage(
			message => {
				this.handleWebviewMessage(message);
			},
			null,
			this._disposables
		);
	}

	public get webviewPanel(): vscode.WebviewPanel {
		return this._webviewPanel;
	}

	public get document(): vscode.TextDocument | undefined {
		return this._document;
	}

	public async update() {
		if (this._document) {
			this._webviewPanel.title = 'Preview ' + this._document.fileName.split('\\').pop()?.split('/').pop();
			this._webviewPanel.webview.html = await this._renderer.renderDocument(this._document, this._webviewPanel.webview);
		}
	}

	private async handleWebviewMessage(message: any) {
		switch (message.type) {
			case 'syncToEditor':
				console.log('PE: [3/8] Extension Host: Received syncToEditor message from preview webview');
				await this.handleSyncToEditor(message.data);
				break;
			case 'elementSelected':
				await this.handleElementSelection(message.selection);
				break;
			case 'selectionCleared':
				await this.handleSelectionCleared();
				break;
			case 'selectionChanged':
				await this.handleSelectionChanged(message.data);
				break;
			case 'ready':
				await this.handleWebviewReady();
				break;
			case 'error':
				this.handleWebviewError(message.data);
				break;
		}
	}

	private async handleSyncToEditor(elementInfo: any) {
		if (!this._document) {
			return;
		}

		console.log('PE: [4/8] Extension Host: Forwarding message to editor webview');
		const editorWebviewPanel = this._editorProvider.getWebviewPanel(this._document.uri);
		if (editorWebviewPanel) {
			editorWebviewPanel.webview.postMessage({ type: 'selectInTree', data: elementInfo });
		} else {
			console.warn('Could not find editor webview panel to sync to.');
		}
	}

	private async handleSelectionChanged(data: any) {
		if (!this._document || !data.selectedElements) {
			return;
		}

		const editor = vscode.window.visibleTextEditors.find(e =>
			e.document.uri.toString() === this._document!.uri.toString()
		);
		if (!editor) {
			return;
		}

		// Handle multiple selected elements
		const selectedElements = data.selectedElements;
		if (selectedElements.length > 0) {
			const firstElement = selectedElements[0];
			await this.selectElementInEditor(editor, firstElement);

			// Show selection info
			const info = selectedElements.length === 1
				? `Selected: <${firstElement.tagName}>`
				: `Selected: <${firstElement.tagName}> and ${selectedElements.length - 1} more`;
			vscode.window.showInformationMessage(info);
		}
	}

	private async handleWebviewReady() {
		// Send any initial configuration or data to the webview
		this.sendMessageToWebview({
			type: 'initialize',
			config: {
				enableSelection: true,
				enableZoom: true
			}
		});
	}

	private handleWebviewError(data: any) {
		const message = `Webview Error: ${data.message} (Context: ${data.context})`;
		console.error(message, data.stack);
		vscode.window.showErrorMessage(message);
	}

	private async selectElementInEditor(editor: vscode.TextEditor, elementInfo: any) {
		console.log('[4/8] Extension Host: Searching for element in document');
		const text = this._document!.getText();

		let pattern: RegExp;

		// Strategy 1: ID-based matching (most reliable)
		if (elementInfo.id) {
			pattern = new RegExp(`<\\w+[^>]*id\\s*=\\s*["']${this.escapeRegex(elementInfo.id)}["'][^>]*(?:\\/?>|>[^]*?<\\/\\w+>)`, 'gi');
		}
		// Strategy 2: Key attributes matching
		else if (elementInfo.keyAttributes && Object.keys(elementInfo.keyAttributes).length > 0) {
			let attributePattern = `<${elementInfo.tagName}[^>]*`;
			for (const [attr, value] of Object.entries(elementInfo.keyAttributes)) {
				attributePattern += `${attr}\\s*=\\s*["']${this.escapeRegex(String(value))}["'][^>]*`;
			}
			attributePattern += `(?:\\/?>|>[^]*?<\\/${elementInfo.tagName}>)`;
			pattern = new RegExp(attributePattern, 'gi');
		}
		// Strategy 3: Tag name only (fallback)
		else {
			pattern = new RegExp(`<${elementInfo.tagName}(?:\\s[^>]*)?(?:\\/?>|>[^]*?<\\/${elementInfo.tagName}>)`, 'gi');
		}

		const match = pattern.exec(text);
		if (match) {
			console.log('[5/8] Extension Host: Element found, applying selection and revealing in editor');
			const startPos = this._document!.positionAt(match.index);
			const endPos = this._document!.positionAt(match.index + match[0].length);
			const range = new vscode.Range(startPos, endPos);

			// Select and reveal the element
			editor.selection = new vscode.Selection(range.start, range.end);
			editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
		}
	}

	private escapeRegex(str: string): string {
		return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}

	private async handleElementSelection(selection: any[]) {
		if (!this._document) {
			return;
		}

		// Find the corresponding text position in the editor
		const editor = vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === this._document!.uri.toString());
		if (!editor) {
			return;
		}

		// For now, we'll implement basic element finding
		// In a more sophisticated implementation, we'd parse the XML and map positions
		const firstElement = selection[0];
		if (firstElement && firstElement.tagName) {
			const text = this._document.getText();
			const tagPattern = new RegExp(`<${firstElement.tagName}(?:\\s[^>]*)?(?:\\/?>|>[^]*?<\\/${firstElement.tagName}>)`, 'gi');
			const match = tagPattern.exec(text);

			if (match) {
				const startPos = this._document.positionAt(match.index);
				const endPos = this._document.positionAt(match.index + match[0].length);
				const range = new vscode.Range(startPos, endPos);

				// Select the element in the editor
				editor.selection = new vscode.Selection(range.start, range.end);
				editor.revealRange(range, vscode.TextEditorRevealType.InCenter);

				// Show information about the selected element
				vscode.window.showInformationMessage(
					`Selected: <${firstElement.tagName}> ${selection.length > 1 ? `(and ${selection.length - 1} more)` : ''}`
				);
			}
		}
	}

	private async handleSelectionCleared() {
		// Optional: Clear editor selection or provide feedback
		vscode.window.showInformationMessage('SVG selection cleared');
	}

	public sendMessageToWebview(message: any) {
		this._webviewPanel.webview.postMessage(message);
	}

	public highlightElementInPreview(elementInfo: { tagName: string; id?: string; className?: string }) {
		console.log(`EP: [5/8] Preview Manager: Received highlight request`);
		console.log(`EP: [6/8] Preview Manager: Sending highlight message to preview webview`);
		// Send message to webview to highlight the element
		this.sendMessageToWebview({
			type: 'highlightElement',
			data: {
				elementInfo
			}
		});
	}

	public sendAttributeUpdate(updateMessage: any) {
		console.log(`AC: [5/8] Preview Manager: Received attribute change request`);
		console.log(`AC: [6/8] Preview Manager: Forwarding 'attributeChange' message to preview webview`);

		// The `updateMessage` object already has the correct structure, like { type: 'attributeChange', ... },
		// as it was sent directly from the editor webview.
		// We just need to forward this entire message object to the preview's webview.
		this.sendMessageToWebview(updateMessage);
	}

	public selectElementInPreview(elementInfo: { tagName: string; id?: string; className?: string }) {
		// Send message to webview to select the element
		this.sendMessageToWebview({
			type: 'selectElement',
			data: {
				elementInfo
			}
		});
	}

	public dispose() {
		this._disposables.forEach(d => d.dispose());
	}
}

export class DynamicXmlPreview {
	public static readonly viewType = 'xml.preview';

	private _preview: XmlPreview | undefined;

	constructor(private readonly _context: vscode.ExtensionContext, private readonly _editorProvider: any) { }

	public show(document: vscode.TextDocument, viewColumn: vscode.ViewColumn) {
		if (this._preview) {
			try {
				this._preview.webviewPanel.reveal(viewColumn);
			} catch (error) {
				// Webview is disposed, clear the reference and create a new one
				this._preview = undefined;
			}
		}

		if (!this._preview) {
			const webviewPanel = vscode.window.createWebviewPanel(
				DynamicXmlPreview.viewType,
				'XML Preview',
				viewColumn,
				{
					enableScripts: true,
					retainContextWhenHidden: false, // 👈 disables caching of WebView context
					localResourceRoots: [vscode.Uri.file(this._context.extensionPath)]
				}
			);

			this._preview = new XmlPreview(webviewPanel, document, this._editorProvider, this._context);

			// Clean up the reference when webview is disposed
			webviewPanel.onDidDispose(() => {
				this._preview = undefined;
			});
		}

		this._preview.update();
	}
	public get activePreview(): XmlPreview | undefined {
		return this._preview;
	}
}
