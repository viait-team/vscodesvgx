/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { XmlDocumentRenderer } from './documentRenderer';

class XmlPreview {
	private readonly _webviewPanel: vscode.WebviewPanel;
	private _document: vscode.TextDocument | undefined;
	private readonly _renderer: XmlDocumentRenderer;
	private readonly _disposables: vscode.Disposable[] = [];

	constructor(webviewPanel: vscode.WebviewPanel, document: vscode.TextDocument) {
		this._webviewPanel = webviewPanel;
		this._document = document;
		this._renderer = new XmlDocumentRenderer();

		this._webviewPanel.onDidDispose(() => {
			this.dispose();
		}, null, this._disposables);

		vscode.workspace.onDidChangeTextDocument(e => {
			if (e.document === this._document) {
				this.update();
			}
		}, null, this._disposables);
	}

	public get webviewPanel(): vscode.WebviewPanel {
		return this._webviewPanel;
	}

	public get document(): vscode.TextDocument | undefined {
		return this._document;
	}

	public async update() {
		if (this._document) {
			this._webviewPanel.title = 'Preview ' + this._document.fileName.split('\\').pop()?.split('/').pop();
			this._webviewPanel.webview.html = await this._renderer.renderDocument(this._document, this._webviewPanel.webview);
		}
	}

	public dispose() {
		this._disposables.forEach(d => d.dispose());
	}
}

export class DynamicXmlPreview {
	public static readonly viewType = 'xml.preview';

	private _preview: XmlPreview | undefined;

	constructor(private readonly _context: vscode.ExtensionContext) { }

	public show(document: vscode.TextDocument, viewColumn: vscode.ViewColumn) {
		if (this._preview) {
			this._preview.webviewPanel.reveal(viewColumn);
		} else {
			const webviewPanel = vscode.window.createWebviewPanel(
				DynamicXmlPreview.viewType,
				'XML Preview',
				viewColumn,
				{
					enableScripts: true,
					localResourceRoots: [vscode.Uri.file(this._context.extensionPath)]
				}
			);

			this._preview = new XmlPreview(webviewPanel, document);
		}

		this._preview.update();
	}

	public get activePreview(): XmlPreview | undefined {
		return this._preview;
	}
}
