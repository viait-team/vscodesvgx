
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export class XmlDocumentRenderer {
	public async renderDocument(document: vscode.TextDocument, webview: vscode.Webview): Promise<string> {
		const fileContent = document.getText();

		if (document.fileName.toLowerCase().endsWith('.svg')) {
			return this.renderSvgPreview(fileContent, webview);
		}

		// For XML and other files, return formatted XML content
		return this.renderXmlPreview(fileContent, webview);
	}

	private renderSvgPreview(svgContent: string, webview: vscode.Webview): string {
		const nonce = this.getNonce();
		const cspSource = webview.cspSource;

		// Create a data URI for the SVG content
		const svgDataUri = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgContent)))}`;

		return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, minimum-scale=0.1, user-scalable=yes">
    <title>SVG Preview</title>

    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: ${cspSource}; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}';">

    <style nonce="${nonce}">
        html, body {
            width: 100%;
            height: 100%;
            margin: 0;
            padding: 0;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            font-family: var(--vscode-editor-font-family);
        }

        .container {
            display: flex;
            justify-content: center;
            align-items: center;
            width: 100%;
            height: 100%;
            padding: 20px;
            box-sizing: border-box;
        }

        .svg-container {
            max-width: 100%;
            max-height: 100%;
            display: flex;
            justify-content: center;
            align-items: center;
            border: 1px solid var(--vscode-widget-border);
            background-color: var(--vscode-editor-background);
            border-radius: 4px;
            overflow: auto;
        }

        .svg-image {
            max-width: 100%;
            max-height: 100%;
            object-fit: contain;
        }

        .error {
            color: var(--vscode-errorForeground);
            text-align: center;
            padding: 20px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="svg-container">
            <img class="svg-image" src="${svgDataUri}" alt="SVG Preview" />
        </div>
    </div>

    <script nonce="${nonce}">
        // Handle image load errors
        document.querySelector('.svg-image').addEventListener('error', function() {
            this.parentElement.innerHTML = '<div class="error">Failed to load SVG. The file may be corrupted or contain invalid SVG content.</div>';
        });

        // Handle zoom with mouse wheel
        document.addEventListener('wheel', function(e) {
            if (e.ctrlKey) {
                e.preventDefault();
                const img = document.querySelector('.svg-image');
                const container = document.querySelector('.svg-container');
                const currentScale = parseFloat(img.style.transform.replace('scale(', '').replace(')', '')) || 1;
                const delta = e.deltaY > 0 ? 0.9 : 1.1;
                const newScale = Math.max(0.1, Math.min(5, currentScale * delta));
                img.style.transform = 'scale(' + newScale + ')';
            }
        });
    </script>
</body>
</html>`;
	}

	private renderXmlPreview(xmlContent: string, _webview: vscode.Webview): string {
		const nonce = this.getNonce();

		// Escape HTML entities in XML content for safe display
		const escapedXml = xmlContent
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#039;');

		return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>XML Preview</title>

    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}';">

    <style nonce="${nonce}">
        body {
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            font-family: var(--vscode-editor-font-family);
            margin: 0;
            padding: 20px;
        }

        .xml-content {
            white-space: pre-wrap;
            font-family: 'Courier New', monospace;
            background-color: var(--vscode-textCodeBlock-background);
            padding: 15px;
            border-radius: 4px;
            border: 1px solid var(--vscode-widget-border);
            overflow: auto;
        }
    </style>
</head>
<body>
    <div class="xml-content">${escapedXml}</div>
</body>
</html>`;
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
