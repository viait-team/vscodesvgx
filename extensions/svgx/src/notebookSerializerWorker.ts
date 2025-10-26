/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// SVGX Notebook Serializer Worker for Node.js
// This file is the entry point for the worker thread that is used to serialize `.svgx`
// files in the Node.js environment.
//
// It listens for messages from the main thread, which contain the notebook data to be
// serialized. It then calls the `serializeNotebookToString` method to perform the
// serialization, and sends the result back to the main thread.
//
// This file is a direct copy of the `ipynb` extension's implementation.


import { parentPort } from 'worker_threads';
import { serializeNotebookToString } from './serializers';
import type { NotebookData } from 'vscode';


if (parentPort) {
	parentPort.on('message', ({ id, data }: { id: string; data: NotebookData }) => {
		if (parentPort) {
			const json = serializeNotebookToString(data);
			const bytes = new TextEncoder().encode(json);
			parentPort.postMessage({ id, data: bytes });
		}
	});
}
