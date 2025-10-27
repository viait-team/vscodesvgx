
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { XmlPreviewManager } from '../preview/previewManager';

export class OpenInBrowserCommand {
	constructor(private readonly _previewManager: XmlPreviewManager) { }

	public async execute(args?: { resource?: string }) {
		let resourceUri: vscode.Uri | undefined;

		// First try to get the resource from the webview context
		if (args?.resource) {
			try {
				resourceUri = vscode.Uri.parse(args.resource);
			} catch (error) {
				console.error('Failed to parse resource URI from context:', error);
			}
		}

		// If we got a resource URI from context, use it
		if (resourceUri) {
			try {
				await vscode.env.openExternal(resourceUri);
				return;
			} catch (error) {
				vscode.window.showErrorMessage('Failed to open in browser: ' + error);
				return;
			}
		}

		// Fallback: Try to get the currently active webview preview
		const activeWebviewPreview = this._previewManager.getCurrentlyActiveWebviewPreview();

		if (activeWebviewPreview) {
			// If we have an active webview preview, open its document in browser
			try {
				await vscode.env.openExternal(activeWebviewPreview.uri);
				return;
			} catch (error) {
				vscode.window.showErrorMessage('Failed to open in browser: ' + error);
				return;
			}
		}

		// Final fallback: try to get from active custom editor tab
		const activeTabInput = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
		if (activeTabInput && activeTabInput instanceof vscode.TabInputCustom) {
			try {
				await vscode.env.openExternal(activeTabInput.uri);
			} catch (error) {
				vscode.window.showErrorMessage('Failed to open in browser: ' + error);
			}
		} else {
			vscode.window.showErrorMessage('No active XML file found to open in browser');
		}
	}
}
