/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
export class XmlPreviewConfig {
    static get scrollPreviewWithEditor() {
        return vscode.workspace.getConfiguration('xml').get('preview.scrollPreviewWithEditor', true);
    }
    static get scrollEditorWithPreview() {
        return vscode.workspace.getConfiguration('xml').get('preview.scrollEditorWithPreview', true);
    }
}
export class XmlPreviewConfigurationManager {
    constructor(_onConfigurationChanged) {
        this._onConfigurationChanged = _onConfigurationChanged;
        this._disposables = [];
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('xml.preview')) {
                this._onConfigurationChanged();
            }
        }, null, this._disposables);
    }
    dispose() {
        this._disposables.forEach(d => d.dispose());
    }
}
