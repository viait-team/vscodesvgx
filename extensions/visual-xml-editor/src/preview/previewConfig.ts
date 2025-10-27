
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export class XmlPreviewConfig {
    public static get scrollPreviewWithEditor(): boolean {
        return vscode.workspace.getConfiguration('xml').get<boolean>('preview.scrollPreviewWithEditor', true);
    }

    public static get scrollEditorWithPreview(): boolean {
        return vscode.workspace.getConfiguration('xml').get<boolean>('preview.scrollEditorWithPreview', true);
    }
}

export class XmlPreviewConfigurationManager {
    private readonly _disposables: vscode.Disposable[] = [];

    constructor(private readonly _onConfigurationChanged: () => void) {
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('xml.preview')) {
                this._onConfigurationChanged();
            }
        }, null, this._disposables);
    }

    public dispose() {
        this._disposables.forEach(d => d.dispose());
    }
}
