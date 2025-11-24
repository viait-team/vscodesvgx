/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
export class XmlDocumentRenderer {

	constructor(private readonly context: vscode.ExtensionContext) { }

	public async renderDocument(document: vscode.TextDocument, webview: vscode.Webview): Promise<string> {
		const fileContent = document.getText();

		const lowerCaseFileName = document.fileName.toLowerCase();
		if (lowerCaseFileName.endsWith('.svg') || lowerCaseFileName.endsWith('.svgx')) {
			return this.renderSvgPreview(fileContent, webview);
		}
		return await this.renderXmlPreview(fileContent, webview, document.uri);
	}

	private async renderSvgPreview(svgContent: string, webview: vscode.Webview): Promise<string> {

		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(
			this.context.extensionUri, 'media', 'previewWebview.js'));
		const htmlUri = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'previewWebview.html');

		let html = await vscode.workspace.fs.readFile(htmlUri).then(buffer => new TextDecoder().decode(buffer));

		// Replace placeholders in HTML
		html = html.replace('{{scriptUri}}', scriptUri.toString());

		// Add SVG content initialization script using JSON encoding
		const svgContentJson = JSON.stringify(svgContent);
		const initScript = `
		<script>
			// Initialize with SVG content when the module loads
			window.addEventListener('DOMContentLoaded', () => {
				console.log('EP: [6/8] Preview: DOM loaded, will initialize with SVG content');
				// Send init message directly to the window (the module listens for this)
				setTimeout(() => {
					console.log('EP: [7/8] Preview: Dispatching init message with SVG content');
					window.postMessage({
						type: 'init',
						content: ${svgContentJson},
						theme: 'light',
						experimentalTwoPanel: false
					}, '*');
				}, 100);
			});
		</script>
		`;

		// Insert the initialization script before the closing body tag
		html = html.replace('</body>', initScript + '\n</body>');

		return html;
	}

	private async renderXmlPreview(xmlContent: string, _webview: vscode.Webview, _documentUri: vscode.Uri): Promise<string> {
		const nonce = this.getNonce();
		console.log('EP: [5/8] DocumentRenderer.renderXmlPreview() - Processing XML content, length:', xmlContent.length);

		const escapedContent = this.escapeHtml(xmlContent);
		return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>XML Preview</title>
<style nonce="${nonce}">
body { background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); }
.xml-content { white-space: pre-wrap; font-family: monospace; padding: 20px; }
</style>
</head>
<body>
<div class="xml-content">${escapedContent}</div>
</body>
</html>`;
	}

	private escapeHtml(unsafe: string): string {
		return unsafe
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;');
	}

	private getNonce(): string {
		let text = '';
		const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
		for (let i = 0; i < 32; i++) {
			text += possible.charAt(Math.floor(Math.random() * possible.length));
		}
		return text;
	}
}
