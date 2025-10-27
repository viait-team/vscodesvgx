
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';

export class XmlDocumentRenderer {
	public async renderDocument(document: vscode.TextDocument, webview: vscode.Webview): Promise<string> {
		const fileContent = document.getText();

		if (document.fileName.toLowerCase().endsWith('.svg')) {
			return this.renderSvgPreview(fileContent, webview);
		}

		// For XML and other files, return formatted XML content with potential XSLT transformation
		return await this.renderXmlPreview(fileContent, webview, document.uri);
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

	private async renderXmlPreview(xmlContent: string, _webview: vscode.Webview, documentUri: vscode.Uri): Promise<string> {
		const nonce = this.getNonce();

		// Check for XSLT transformation first
		const xsltInfo = this.extractXsltReference(xmlContent);
		if (xsltInfo) {
			try {
				const xslContent = await this.getXsltContent(xsltInfo, documentUri);
				return this.createXsltTransformedPreview(xmlContent, xslContent, nonce);
			} catch (error) {
				console.error('XSLT transformation failed:', error);
				// Fall back to displaying raw XML with error message
				return this.createRawXmlPreview(xmlContent, nonce, `XSLT transformation failed: ${error}`);
			}
		}

		// No XSLT, display raw XML
		return this.createRawXmlPreview(xmlContent, nonce);
	}

	private extractXsltReference(xmlContent: string): { type: 'external' | 'embedded'; href?: string; xslContent?: string } | null {
		// Check for external XSLT stylesheet processing instruction (including data URIs)
		// Handle multi-line processing instructions by using [\s\S] to match any character including newlines
		const externalXslMatch = xmlContent.match(/<\?xml-stylesheet[\s\S]*?href\s*=\s*["']([^"']*(?:\n[^"']*)*)["'][\s\S]*?\?>/i);
		if (externalXslMatch) {
			let href = externalXslMatch[1];

			// Clean up any newlines and whitespace in the href
			href = href.replace(/\s+/g, '');

			// Check if it's a data URI with embedded XSLT
			if (href.startsWith('data:text/xsl') || href.startsWith('data:application/xslt+xml')) {
				// Extract the XSLT content from the data URI
				const dataUriMatch = href.match(/data:[^,]*,(.+)/);
				if (dataUriMatch) {
					try {
						// URL decode the content
						const xslContent = decodeURIComponent(dataUriMatch[1]);
						return {
							type: 'embedded',
							xslContent: xslContent
						};
					} catch (error) {
						console.error('Failed to decode data URI:', error);
						return null;
					}
				}
			} else {
				// Regular external file reference
				return {
					type: 'external',
					href: href
				};
			}
		}

		// Check for embedded XSLT stylesheet element
		const embeddedXslMatch = xmlContent.match(/<xsl:stylesheet[^>]*>[\s\S]*?<\/xsl:stylesheet>/i);
		if (embeddedXslMatch) {
			let xslContent = embeddedXslMatch[0];

			// Ensure the XSLT has proper namespace declaration
			if (!xslContent.includes('xmlns:xsl=')) {
				// Add the XSLT namespace declaration
				xslContent = xslContent.replace(
					/<xsl:stylesheet([^>]*)>/i,
					'<xsl:stylesheet$1 xmlns:xsl="http://www.w3.org/1999/XSL/Transform">'
				);
			}

			return {
				type: 'embedded',
				xslContent: xslContent
			};
		}

		return null;
	}

	private async getXsltContent(xsltInfo: { type: 'external' | 'embedded'; href?: string; xslContent?: string }, documentUri?: vscode.Uri): Promise<string> {
		console.log('getXsltContent called with:', { type: xsltInfo.type, href: xsltInfo.href, hasXslContent: !!xsltInfo.xslContent, hasDocumentUri: !!documentUri });

		if (xsltInfo.type === 'external' && xsltInfo.href) {
			if (!documentUri) {
				throw new Error('Document URI is required for external XSLT files');
			}

			// Read external XSLT file
			const documentDir = path.dirname(documentUri.fsPath);
			const xslPath = path.resolve(documentDir, xsltInfo.href);
			const xslUri = vscode.Uri.file(xslPath);

			console.log('Attempting to load external XSLT from:', xslPath);

			try {
				const xslDocument = await vscode.workspace.openTextDocument(xslUri);
				const content = xslDocument.getText();
				console.log('Successfully loaded XSLT content, length:', content.length);

				// Check if it's XSLT 2.0 and warn (browsers only support 1.0)
				if (content.includes('version="2.0"')) {
					console.warn('XSLT 2.0 detected - browsers only support XSLT 1.0. Transformation may fail.');
				}

				return content;
			} catch (error) {
				throw new Error(`Failed to read XSLT file "${xsltInfo.href}": ${error}`);
			}
		} else if (xsltInfo.type === 'embedded' && xsltInfo.xslContent) {
			return xsltInfo.xslContent;
		} else {
			throw new Error(`Invalid XSLT information provided. Type: ${xsltInfo.type}, has href: ${!!xsltInfo.href}, has xslContent: ${!!xsltInfo.xslContent}`);
		}
	}

	private createXsltTransformedPreview(xmlContent: string, xslContent: string, nonce: string): string {
		// Check if XSLT 2.0+ features are used
		const isXslt20Plus = xslContent.includes('version="2.0"') ||
			xslContent.includes('version="3.0"') ||
			xslContent.includes('xmlns:xs=') ||
			xslContent.includes('xmlns:fn=');

		if (isXslt20Plus) {
			return this.createXslt20WarningPreview(xmlContent, nonce);
		}

		// Escape the XML and XSL content for safe embedding in JavaScript
		const escapedXml = xmlContent
			.replace(/\\/g, '\\\\')
			.replace(/'/g, "\\'")
			.replace(/\r?\n/g, '\\n');

		const escapedXsl = xslContent
			.replace(/\\/g, '\\\\')
			.replace(/'/g, "\\'")
			.replace(/\r?\n/g, '\\n');

		return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>XML Preview with XSLT</title>

    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}';">

    <style nonce="${nonce}">
        body {
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            font-family: var(--vscode-editor-font-family);
            margin: 0;
            padding: 20px;
        }

        .transformation-result {
            border: 1px solid var(--vscode-widget-border);
            border-radius: 4px;
            overflow: auto;
        }

        .error {
            color: var(--vscode-errorForeground);
            background-color: var(--vscode-inputValidation-errorBackground);
            border: 1px solid var(--vscode-inputValidation-errorBorder);
            padding: 10px;
            border-radius: 4px;
            margin: 10px 0;
        }
    </style>
</head>
<body>
    <div id="transformation-result" class="transformation-result"></div>

    <script nonce="${nonce}">
        function performXsltTransformation() {
            const resultDiv = document.getElementById('transformation-result');

            try {
                // Parse XML
                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString('${escapedXml}', 'text/xml');

                // Check for XML parsing errors
                const xmlParseError = xmlDoc.querySelector('parsererror');
                if (xmlParseError) {
                    throw new Error('XML parsing error: ' + xmlParseError.textContent);
                }

                // Parse XSL
                const xslDoc = parser.parseFromString('${escapedXsl}', 'text/xml');

                // Check for XSL parsing errors
                const xslParseError = xslDoc.querySelector('parsererror');
                if (xslParseError) {
                    throw new Error('XSL parsing error: ' + xslParseError.textContent);
                }

                // Create XSLT processor
                const xsltProcessor = new XSLTProcessor();
                xsltProcessor.importStylesheet(xslDoc);

                // Perform transformation
                const resultDoc = xsltProcessor.transformToFragment(xmlDoc, document);

                // Display result
                resultDiv.innerHTML = '';
                resultDiv.appendChild(resultDoc);

            } catch (error) {
                console.error('XSLT transformation error:', error);
                resultDiv.innerHTML = '<div class="error">Transformation failed: ' + error.message + '</div>';
            }
        }        // Perform transformation when page loads
        performXsltTransformation();
    </script>
</body>
</html>`;
	}

	private createXslt20WarningPreview(xmlContent: string, nonce: string): string {
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
    <title>XSLT 2.0+ Not Supported</title>

    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}';">

    <style nonce="${nonce}">
        body {
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            font-family: var(--vscode-editor-font-family);
            margin: 0;
            padding: 20px;
        }

        .warning {
            background-color: var(--vscode-inputValidation-warningBackground);
            border: 2px solid var(--vscode-inputValidation-warningBorder);
            color: var(--vscode-inputValidation-warningForeground);
            padding: 15px;
            border-radius: 4px;
            margin: 10px 0;
        }

        .error {
            background-color: var(--vscode-inputValidation-errorBackground);
            border: 2px solid var(--vscode-inputValidation-errorBorder);
            color: var(--vscode-errorForeground);
            padding: 15px;
            border-radius: 4px;
            margin: 10px 0;
        }

        .xml-content {
            white-space: pre-wrap;
            font-family: 'Courier New', monospace;
            background-color: var(--vscode-textCodeBlock-background);
            padding: 15px;
            border-radius: 4px;
            border: 1px solid var(--vscode-widget-border);
            overflow: auto;
            margin: 20px 0;
        }

        .solutions {
            background-color: var(--vscode-textCodeBlock-background);
            padding: 15px;
            border-radius: 4px;
            border: 1px solid var(--vscode-widget-border);
            margin: 20px 0;
        }

        .solutions h3 {
            margin-top: 0;
        }

        .solutions ul {
            margin: 10px 0;
        }

        .solutions li {
            margin: 5px 0;
        }
    </style>
</head>
<body>
    <div class="error">
        <h2>⚠️ XSLT 2.0+ Not Supported in Browsers</h2>
        <p>This XSLT stylesheet uses XSLT 2.0 or higher features, but web browsers only support XSLT 1.0.</p>
    </div>

    <div class="warning">
        <h3>Why This Happens</h3>
        <p>Web browsers (Chrome, Firefox, Safari, Edge) have built-in XSLT processors that only support XSLT 1.0, regardless of whether you use:</p>
        <ul>
            <li><code>&lt;?xml-stylesheet&gt;</code> processing instructions</li>
            <li>JavaScript's <code>XSLTProcessor</code> API</li>
            <li>Any other client-side transformation method</li>
        </ul>
    </div>

    <div class="solutions">
        <h3>🔧 Solutions</h3>
        <ul>
            <li><strong>Convert to XSLT 1.0:</strong> Rewrite the stylesheet using only XSLT 1.0 features</li>
            <li><strong>Use Saxon-JS:</strong> Include Saxon-JS library for client-side XSLT 2.0/3.0 support</li>
            <li><strong>Server-side transformation:</strong> Transform XML on the server before sending to browser</li>
            <li><strong>Alternative processors:</strong> Use Node.js with xslt3 or Saxon processors</li>
        </ul>
    </div>

    <div class="xml-content">${escapedXml}</div>
</body>
</html>`;
	}

	private createRawXmlPreview(xmlContent: string, nonce: string, errorMessage?: string): string {
		// Escape HTML entities in XML content for safe display
		const escapedXml = xmlContent
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#039;');

		const errorHtml = errorMessage ? `<div class="error">${errorMessage}</div>` : '';

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

        .error {
            color: var(--vscode-errorForeground);
            background-color: var(--vscode-inputValidation-errorBackground);
            border: 1px solid var(--vscode-inputValidation-errorBorder);
            padding: 10px;
            border-radius: 4px;
            margin: 10px 0;
        }
    </style>
</head>
<body>
    ${errorHtml}
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
