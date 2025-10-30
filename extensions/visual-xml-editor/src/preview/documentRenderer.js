/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import * as path from 'path';
export class XmlDocumentRenderer {
    async renderDocument(document, webview) {
        const fileContent = document.getText();
        if (document.fileName.toLowerCase().endsWith('.svg')) {
            return this.renderSvgPreview(fileContent, webview);
        }
        // For XML and other files, return formatted XML content with potential XSLT transformation
        return await this.renderXmlPreview(fileContent, webview, document.uri);
    }
    renderSvgPreview(svgContent, webview) {
        const nonce = this.getNonce();
        // Get the URI for our webview script
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(vscode.Uri.file(path.dirname(__dirname)), 'webview', 'main.js'));
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, minimum-scale=0.1, user-scalable=yes">
    <title>Interactive SVG Preview</title>

    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}' ${webview.cspSource}; style-src 'nonce-${nonce}' 'unsafe-inline';">

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

        #svg-container {
            max-width: 100%;
            max-height: 100%;
            display: flex;
            justify-content: center;
            align-items: center;
            border: 1px solid var(--vscode-widget-border);
            background-color: var(--vscode-editor-background);
            border-radius: 4px;
            overflow: hidden;
            position: relative;
        }

        #svg-container svg {
            max-width: 100%;
            max-height: 100%;
        }

        .error {
            color: var(--vscode-errorForeground);
            text-align: center;
            padding: 20px;
        }

        /* Loading state */
        .loading {
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 200px;
            color: var(--vscode-descriptionForeground);
        }

        /* Highlight styles for editor synchronization */
        .editor-highlight {
            outline: 3px solid var(--vscode-focusBorder) !important;
            outline-offset: 2px;
            animation: flash 0.8s ease-in-out;
        }

        @keyframes flash {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }

        /* Selection styles */
        .selected-from-preview {
            outline: 2px solid var(--vscode-selection-background) !important;
            outline-offset: 1px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div id="svg-container" class="loading">
            Loading interactive preview...
        </div>
    </div>

    <!-- Load our bundled webview script -->
    <script nonce="${nonce}" src="${scriptUri}"></script>

    <script nonce="${nonce}">
        // Initialize the webview with SVG content - use D3.js approach
        window.addEventListener('DOMContentLoaded', () => {
            try {
                // Set the SVG content immediately using D3.js
                const container = document.getElementById('svg-container');
                if (container) {
                    container.innerHTML = \`${svgContent.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`;
                    container.classList.remove('loading');

                    // Ensure D3.js can access the SVG
                    console.log('SVG content loaded into svg-container:', container.children.length, 'elements');
                }

                // Wait for our modules to initialize, then send the SVG content
                setTimeout(() => {
                    if (window.vscode) {
                        window.vscode.postMessage({
                            type: 'setSVGContent',
                            data: { content: \`${svgContent.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\` },
                            timestamp: Date.now()
                        });
                    }
                }, 500);

            } catch (error) {
                console.error('Error initializing SVG preview:', error);
                const container = document.getElementById('svg-container');
                if (container) {
                    container.innerHTML = '<div class="error">Failed to initialize interactive preview</div>';
                }
            }
        });
    </script>
</body>
</html>`;
    }
    async renderXmlPreview(xmlContent, _webview, documentUri) {
        const nonce = this.getNonce();
        // Wrap everything in comprehensive error handling
        try {
            // Basic XML validation first
            if (!xmlContent || xmlContent.trim().length === 0) {
                return this.createRawXmlPreview('<!-- Empty or invalid XML content -->', nonce, 'No content to preview');
            }
            // Check for XSLT transformation
            const xsltInfo = this.extractXsltReference(xmlContent);
            if (xsltInfo) {
                try {
                    const xslContent = await this.getXsltContent(xsltInfo, documentUri);
                    return this.createXsltTransformedPreview(xmlContent, xslContent, nonce);
                }
                catch (xsltError) {
                    console.error('XSLT transformation failed:', xsltError);
                    // Fall back to displaying raw XML with error message instead of crashing
                    return this.createRawXmlPreview(xmlContent, nonce, `XSLT transformation failed: ${xsltError instanceof Error ? xsltError.message : String(xsltError)}`);
                }
            }
            // No XSLT, display raw XML
            return this.createRawXmlPreview(xmlContent, nonce);
        }
        catch (error) {
            // Ultimate fallback - should never crash the webview
            console.error('Critical error in renderXmlPreview:', error);
            return this.createEmergencyFallbackPreview(xmlContent, nonce);
        }
    }
    extractXsltReference(xmlContent) {
        try {
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
                        }
                        catch (error) {
                            console.error('Failed to decode data URI:', error);
                            return null;
                        }
                    }
                }
                else {
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
                    xslContent = xslContent.replace(/<xsl:stylesheet([^>]*)>/i, '<xsl:stylesheet$1 xmlns:xsl="http://www.w3.org/1999/XSL/Transform">');
                }
                return {
                    type: 'embedded',
                    xslContent: xslContent
                };
            }
            return null;
        }
        catch (error) {
            console.error('Error extracting XSLT reference:', error);
            return null;
        }
    }
    async getXsltContent(xsltInfo, documentUri) {
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
            }
            catch (error) {
                throw new Error(`Failed to read XSLT file "${xsltInfo.href}": ${error}`);
            }
        }
        else if (xsltInfo.type === 'embedded' && xsltInfo.xslContent) {
            return xsltInfo.xslContent;
        }
        else {
            throw new Error(`Invalid XSLT information provided. Type: ${xsltInfo.type}, has href: ${!!xsltInfo.href}, has xslContent: ${!!xsltInfo.xslContent}`);
        }
    }
    createXsltTransformedPreview(xmlContent, xslContent, nonce) {
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
            .replace(/'/g, '\\\'')
            .replace(/\r?\n/g, '\\n');
        const escapedXsl = xslContent
            .replace(/\\/g, '\\\\')
            .replace(/'/g, '\\\'')
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
    createEmergencyFallbackPreview(content, nonce) {
        const escapedContent = content
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
    <title>Emergency Fallback Preview</title>
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}';">
    <style nonce="${nonce}">
        body {
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            font-family: var(--vscode-editor-font-family);
            margin: 0;
            padding: 20px;
            line-height: 1.4;
        }
        .error-banner {
            background-color: var(--vscode-inputValidation-errorBackground);
            color: var(--vscode-errorForeground);
            border: 1px solid var(--vscode-inputValidation-errorBorder);
            padding: 15px;
            border-radius: 4px;
            margin-bottom: 20px;
        }
        .content {
            white-space: pre-wrap;
            font-family: var(--vscode-editor-font-family);
            border: 1px solid var(--vscode-widget-border);
            padding: 15px;
            border-radius: 4px;
            background-color: var(--vscode-input-background);
            overflow: auto;
            max-height: 80vh;
        }
    </style>
</head>
<body>
    <div class="error-banner">
        ⚠️ Emergency Fallback Mode: The preview system encountered critical errors and has fallen back to safe mode. All transformation features are disabled to prevent system instability.
    </div>
    <div class="content">${escapedContent}</div>
</body>
</html>`;
    }
    createXslt20WarningPreview(xmlContent, nonce) {
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
    createRawXmlPreview(xmlContent, nonce, errorMessage) {
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
    getNonce() {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }
}
