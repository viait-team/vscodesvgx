
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { XmlPreviewManager } from '../preview/previewManager';

export class OpenInBrowserCommand {
	constructor(private readonly _previewManager: XmlPreviewManager) { }

	public async execute() {
		// Get the active custom editor's document
		const activeTabInput = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
		if (activeTabInput && activeTabInput instanceof vscode.TabInputCustom) {
			try {
				const document = await vscode.workspace.openTextDocument(activeTabInput.uri);
				const preview = this._previewManager.getActivePreview(document.uri);
				if (preview && preview.activePreview && preview.activePreview.document) {
					vscode.env.openExternal(preview.activePreview.document.uri);
				} else {
					// If no preview is open, just open the document directly in browser
					vscode.env.openExternal(document.uri);
				}
			} catch (error) {
				vscode.window.showErrorMessage('Failed to open in browser: ' + error);
			}
		} else {
			vscode.window.showErrorMessage('No active Visual XML Editor found');
		}
	}
}
