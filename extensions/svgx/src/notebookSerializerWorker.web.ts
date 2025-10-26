/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// SVGX Notebook Serializer Worker for the Web
// This file is the entry point for the worker thread that is used to serialize `.svgx`
// files in the web environment.
//
// It listens for messages from the main thread, which contain the notebook data to be
// serialized. It then calls the `serializeNotebookToString` method to perform the
// serialization, and sends the result back to the main thread.
//
// This file is a direct copy of the `ipynb` extension's implementation.


import { serializeNotebookToString } from './serializers';
import type { NotebookData } from 'vscode';

onmessage = (e) => {
	const data = e.data as { id: string; data: NotebookData };
	const json = serializeNotebookToString(data.data);
	const bytes = new TextEncoder().encode(json);
	postMessage({ id: data.id, data: bytes });
};
