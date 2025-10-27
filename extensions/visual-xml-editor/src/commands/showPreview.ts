
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { XmlPreviewManager } from '../preview/previewManager';

export class ShowXmlPreviewCommand {
	constructor(private readonly _previewManager: XmlPreviewManager) { }

	public async execute(toSide: boolean) {
		// Get the active custom editor's document
		const activeTabInput = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
		if (activeTabInput && activeTabInput instanceof vscode.TabInputCustom) {
			try {
				const document = await vscode.workspace.openTextDocument(activeTabInput.uri);
				const viewColumn = toSide ? vscode.ViewColumn.Beside : vscode.ViewColumn.Active;
				this._previewManager.openDynamicPreview(document, viewColumn);
			} catch (error) {
				vscode.window.showErrorMessage('Failed to open preview: ' + error);
			}
		} else {
			vscode.window.showErrorMessage('No active Visual XML Editor found');
		}
	}
}
