/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// SVGX Notebook Serializer
// This file implements the following pattern:
//
// 1. A `NotebookSerializerBase` class is defined. This class is responsible for the core
//    serialization and deserialization logic. It is designed to be extended by other
//    classes that provide environment-specific implementations (node or web).
//
// 2. The `NotebookSerializerBase` class is abstract and provides the `deserializeNotebook`
//    and `serializeNotebook` methods. These methods are responsible for converting the
//    `.svgx` file content to a `vscode.NotebookData` object and vice versa.
//
// 3. The `deserializeNotebook` method handles the reading of the `.svgx` file, which is
//    a JSON-based format. It also handles a `__webview_backup` property, which is a
//    custom implementation for the `svgx` extension.
//
// 4. The `serializeNotebook` method takes a `vscode.NotebookData` object and converts it
//    to a string, which is then encoded as a `Uint8Array`. This method is designed to be
//    offloaded to a worker thread for performance.
//
// This pattern is inspired by the `ipynb` extension, which uses a similar approach to
// handle the serialization of Jupyter notebooks. The goal is to provide a consistent
// and performant serialization mechanism that can be used in both the node and web
// environments.


import type * as nbformat from '@jupyterlab/nbformat';
import detectIndent from 'detect-indent';
import * as vscode from 'vscode';
import { getPreferredLanguage, svgxNotebookModelToNotebookData } from './deserializers';
import * as fnv from '@enonic/fnv-plus';
import { serializeNotebookToString } from './serializers';

export abstract class NotebookSerializerBase extends vscode.Disposable implements vscode.NotebookSerializer {
	protected disposed: boolean = false;
	constructor(protected readonly context: vscode.ExtensionContext) {
		super(() => { });
	}

	override dispose() {
		this.disposed = true;
		super.dispose();
	}

	public async deserializeNotebook(content: Uint8Array, _token: vscode.CancellationToken): Promise<vscode.NotebookData> {
		let contents = '';
		try {
			contents = new TextDecoder().decode(content);
		} catch {
		}

		let json = contents && /\S/.test(contents) ? (JSON.parse(contents) as Partial<nbformat.INotebookContent>) : {};

		if (json.__webview_backup) {
			const backupId = json.__webview_backup;
			const uri = this.context.globalStorageUri;
			const folder = uri.with({ path: this.context.globalStorageUri.path.replace('vscode.svgx', 'ms-toolsai.jupyter') });
			const fileHash = fnv.fast1a32hex(backupId) as string;
			const fileName = `${fileHash}.svgx`;
			const file = vscode.Uri.joinPath(folder, fileName);
			const data = await vscode.workspace.fs.readFile(file);
			json = data ? JSON.parse(data.toString()) : {};

			if (json.contents && typeof json.contents === 'string') {
				contents = json.contents;
				json = JSON.parse(contents) as Partial<nbformat.INotebookContent>;
			}
		}

		if (json.nbformat && json.nbformat < 4) {
			throw new Error('Only SVGX notebooks version 4+ are supported');
		}

		// Then compute indent from the contents (only use first 1K characters as a perf optimization)
		const indentAmount = contents ? detectIndent(contents.substring(0, 1_000)).indent : ' ';

		const preferredCellLanguage = getPreferredLanguage(json.metadata);
		// Ensure we always have a blank cell.
		if ((json.cells || []).length === 0) {
			json.cells = [
			];
		}

		// For notebooks without metadata default the language in metadata to the preferred language.
		if (!json.metadata || (!json.metadata.kernelspec && !json.metadata.language_info)) {
			json.metadata = json.metadata || {};
			json.metadata.language_info = json.metadata.language_info || { name: preferredCellLanguage };
		}

		const data = svgxNotebookModelToNotebookData(
			json,
			preferredCellLanguage
		);
		data.metadata = data.metadata || {};
		data.metadata.indentAmount = indentAmount;

		return data;
	}

	public async serializeNotebook(data: vscode.NotebookData, _token: vscode.CancellationToken): Promise<Uint8Array> {
		if (this.disposed) {
			return new Uint8Array(0);
		}

		const serialized = serializeNotebookToString(data);
		return new TextEncoder().encode(serialized);
	}

}