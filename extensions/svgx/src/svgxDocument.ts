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

	private readonly _undoStack: Document[] = [];
	private readonly _redoStack: Document[] = [];

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

	public get documentData(): Uint8Array {
		const serializer = new XMLSerializer();
		const content = serializer.serializeToString(this._dom);
		return new TextEncoder().encode(content);
	}

	public update(newDom: Document) {
		this._undoStack.push(this._dom);
		this._redoStack.length = 0; // Clear the redo stack
		this._dom = newDom;
	}

	public undo(): Document | undefined {
		if (this._undoStack.length === 0) {
			return undefined;
		}

		this._redoStack.push(this._dom);
		const lastState = this._undoStack.pop();
		if (lastState) {
			this._dom = lastState;
		}
		return this._dom;
	}

	public redo(): Document | undefined {
		if (this._redoStack.length === 0) {
			return undefined;
		}

		this._undoStack.push(this._dom);
		const nextState = this._redoStack.pop();
		if (nextState) {
			this._dom = nextState;
		}
		return this._dom;
	}

	private readonly _onDidDispose = new vscode.EventEmitter<void>();
	public readonly onDidDispose = this._onDidDispose.event;

	dispose(): void {
		this._onDidDispose.fire();
		this._onDidDispose.dispose();
	}
}
