/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import { DynamicXmlPreview } from './preview';
export class XmlPreviewManager {
    constructor(_context) {
        this._context = _context;
        this._previews = new Map();
    }
    openDynamicPreview(document, viewColumn) {
        let preview = this._previews.get(document.uri.toString());
        if (preview) {
            preview.show(document, viewColumn);
        }
        else {
            preview = new DynamicXmlPreview(this._context);
            preview.show(document, viewColumn);
            this._previews.set(document.uri.toString(), preview);
        }
    }
    getActivePreview(uri) {
        return this._previews.get(uri.toString());
    }
    getCurrentlyActiveWebviewPreview() {
        // Find the preview that corresponds to the currently active webview panel
        for (const [uriString, preview] of this._previews) {
            if (preview.activePreview && preview.activePreview.webviewPanel.active) {
                return {
                    uri: vscode.Uri.parse(uriString),
                    preview: preview
                };
            }
        }
        return undefined;
    }
    async deserializeWebviewPanel(webviewPanel, _state) {
        // This is not implemented since we are not persisting the preview across restarts.
        // We can implement this in the future if needed.
        webviewPanel.dispose();
        return Promise.resolve();
    }
}
