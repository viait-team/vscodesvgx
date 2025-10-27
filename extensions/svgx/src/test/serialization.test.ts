/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as vscode from 'vscode';
import { NotebookSerializer } from '../notebookSerializer.node';

suite('SVGX Serializer', () => {
	test('Should serialize and deserialize a notebook with worker', async () => {
		await vscode.workspace.getConfiguration('svgx').update('experimental.serialization', true);

		const mockContext = {
			subscriptions: [],
			extensionUri: vscode.Uri.file(__dirname),
			extension: { packageJSON: { main: 'out/extension.js' } as any },
			globalStorageUri: vscode.Uri.file(__dirname)
		} as unknown as vscode.ExtensionContext;

		const serializer = new NotebookSerializer(mockContext);
		const notebook = new vscode.NotebookData([
			new vscode.NotebookCellData(vscode.NotebookCellKind.Code, 'console.log("Hello, world!");', 'javascript')
		]);

		const bytes = await serializer.serializeNotebook(notebook, new vscode.CancellationTokenSource().token);
		const deserializedNotebook = await serializer.deserializeNotebook(bytes, new vscode.CancellationTokenSource().token);

		assert.strictEqual(deserializedNotebook.cells.length, 1);
		assert.strictEqual(deserializedNotebook.cells[0].kind, vscode.NotebookCellKind.Code);
		assert.strictEqual(deserializedNotebook.cells[0].value, 'console.log("Hello, world!");');
		assert.strictEqual(deserializedNotebook.cells[0].languageId, 'javascript');

		await vscode.workspace.getConfiguration('svgx').update('experimental.serialization', undefined);
	});
});
