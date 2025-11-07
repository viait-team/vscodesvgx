/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import { XmlDocumentRenderer } from './documentRenderer';
class XmlPreview {
	constructor(webviewPanel, document) {
		this._disposables = [];
		this._webviewPanel = webviewPanel;
		this._document = document;
		this._renderer = new XmlDocumentRenderer();
		this._webviewPanel.onDidDispose(() => {
			this.dispose();
		}, null, this._disposables);
		vscode.workspace.onDidChangeTextDocument(e => {
			if (e.document === this._document) {
				this.update();
			}
		}, null, this._disposables);
		// Handle messages from the webview
		this._webviewPanel.webview.onDidReceiveMessage(message => {
			this.handleWebviewMessage(message);
		}, null, this._disposables);
	}
	get webviewPanel() {
		return this._webviewPanel;
	}
	get document() {
		return this._document;
	}
	async update() {
		if (this._document) {
			this._webviewPanel.title = 'Preview ' + this._document.fileName.split('\\').pop()?.split('/').pop();
			this._webviewPanel.webview.html = await this._renderer.renderDocument(this._document, this._webviewPanel.webview);
		}
	}
	async handleWebviewMessage(message) {
		switch (message.type) {
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
	async handleSelectionChanged(data) {
		if (!this._document || !data.selectedElements) {
			return;
		}
		const editor = vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === this._document.uri.toString());
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
	async handleWebviewReady() {
		// Send any initial configuration or data to the webview
		this.sendMessageToWebview({
			type: 'initialize',
			config: {
				enableSelection: true,
				enableZoom: true
			}
		});
	}
	handleWebviewError(data) {
		const message = `Webview Error: ${data.message} (Context: ${data.context})`;
		console.error(message, data.stack);
		vscode.window.showErrorMessage(message);
	}
	async selectElementInEditor(editor, elementInfo) {
		const text = this._document.getText();
		let pattern;
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
			const startPos = this._document.positionAt(match.index);
			const endPos = this._document.positionAt(match.index + match[0].length);
			const range = new vscode.Range(startPos, endPos);
			// Select and reveal the element
			editor.selection = new vscode.Selection(range.start, range.end);
			editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
		}
	}
	escapeRegex(str) {
		return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}
	async handleElementSelection(selection) {
		if (!this._document) {
			return;
		}
		// Find the corresponding text position in the editor
		const editor = vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === this._document.uri.toString());
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
				vscode.window.showInformationMessage(`Selected: <${firstElement.tagName}> ${selection.length > 1 ? `(and ${selection.length - 1} more)` : ''}`);
			}
		}
	}
	async handleSelectionCleared() {
		// Optional: Clear editor selection or provide feedback
		vscode.window.showInformationMessage('SVG selection cleared');
	}
	sendMessageToWebview(message) {
		this._webviewPanel.webview.postMessage(message);
	}
	highlightElementInPreview(elementInfo) {
		// Send message to webview to highlight the element
		this.sendMessageToWebview({
			type: 'highlightElement',
			data: {
				selector: this.buildElementSelector(elementInfo),
				elementInfo
			}
		});
	}
	selectElementInPreview(elementInfo) {
		// Send message to webview to select the element
		this.sendMessageToWebview({
			type: 'selectElement',
			data: {
				selector: this.buildElementSelector(elementInfo),
				elementInfo
			}
		});
	}
	buildElementSelector(elementInfo) {
		const selectors = [];
		const baseSelector = elementInfo.tagName.toLowerCase();
		// Strategy 1: ID-based (most reliable)
		if (elementInfo.id) {
			return `#${CSS.escape(elementInfo.id)}`;
		}
		// Strategy 2: Key attributes for elements without ID
		if (elementInfo.keyAttributes && Object.keys(elementInfo.keyAttributes).length > 0) {
			let attributeSelector = baseSelector;
			for (const [attr, value] of Object.entries(elementInfo.keyAttributes)) {
				attributeSelector += `[${attr}="${CSS.escape(value)}"]`;
			}
			selectors.push(attributeSelector);
		}
		// Strategy 3: Class-based
		if (elementInfo.className) {
			const classes = elementInfo.className.trim().split(/\s+/)
				.filter(cls => cls.length > 0)
				.map(cls => CSS.escape(cls));
			if (classes.length > 0) {
				selectors.push(`${baseSelector}.${classes.join('.')}`);
			}
		}
		// Strategy 4: Tag name only (fallback)
		selectors.push(baseSelector);
		return selectors.join(', ');
	}
	dispose() {
		this._disposables.forEach(d => d.dispose());
	}
}
export class DynamicXmlPreview {
	constructor(_context) {
		this._context = _context;
	}
	show(document, viewColumn) {
		if (this._preview) {
			this._preview.webviewPanel.reveal(viewColumn);
		}
		else {
			const webviewPanel = vscode.window.createWebviewPanel(DynamicXmlPreview.viewType, 'XML Preview', viewColumn, {
				enableScripts: true,
				retainContextWhenHidden: false, // 👈 disables caching of WebView context
				localResourceRoots: [vscode.Uri.file(this._context.extensionPath)]
			});
			this._preview = new XmlPreview(webviewPanel, document);
		}
		this._preview.update();
	}
	get activePreview() {
		return this._preview;
	}
}
DynamicXmlPreview.viewType = 'xml.preview';
