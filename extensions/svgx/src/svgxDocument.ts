/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// svgxDocument.ts
import * as vscode from 'vscode';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

export class SvgxDocument implements vscode.CustomDocument {

	private readonly _uri: vscode.Uri;

	private _dom: Document;

	private constructor(
		uri: vscode.Uri,
		dom: Document,
	) {
		this._uri = uri;
		this._dom = dom;
	}

	static async create(uri: vscode.Uri, initialContent: Uint8Array): Promise<SvgxDocument> {
		const content = new TextDecoder().decode(initialContent);
		const dom = new DOMParser().parseFromString(content, 'application/xml');
		return new SvgxDocument(uri, dom);
	}

	public get uri() { return this._uri; }

	public get dom(): Document { return this._dom; }

	public get documentData(): Uint8Array {
		const serializer = new XMLSerializer();
		const content = serializer.serializeToString(this._dom);
		return new TextEncoder().encode(content);
	}

	private readonly _onDidDispose = new vscode.EventEmitter<void>();
	public readonly onDidDispose = this._onDidDispose.event;

	dispose(): void {
		this._onDidDispose.fire();
		this._onDidDispose.dispose();
	}
}
