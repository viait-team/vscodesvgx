/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// SVGX Notebook Serializer for Node.js
// This file implements the following pattern:
//
// 1. A `NotebookSerializer` class is defined, which extends the `NotebookSerializerBase`
//    class. This class is responsible for the serialization of `.svgx` files in the
//    Node.js environment.
//
// 2. The `NotebookSerializer` class uses a worker thread to offload the serialization
//    of the notebook data. This is done to avoid blocking the main thread, which can
//    improve performance and responsiveness.
//
// 3. The worker thread is enabled by the `svgx.experimental.serialization` setting.
//    If this setting is disabled, the serialization is done in the main thread using
//    the `NotebookSerializerBase` implementation.
//
// 4. The worker thread is implemented in the `notebookSerializerWorker.js` file. This
//    file is loaded using the `node:worker_threads` module.
//
// 5. Communication between the main thread and the worker thread is done using the
//    `postMessage` method and the `message` event. A `DeferredPromise` is used to
//    wait for the result from the worker.
//
// This pattern is a direct copy of the `ipynb` extension's implementation, which uses
// a similar approach to handle the serialization of Jupyter notebooks in the Node.js
// environment.


import * as vscode from 'vscode';
import { DeferredPromise, generateUuid } from './helper';
import { NotebookSerializerBase } from './notebookSerializer';

export class NotebookSerializer extends NotebookSerializerBase {
	private experimentalSave = vscode.workspace.getConfiguration('svgx').get('experimental.serialization', true);
	private worker?: import('node:worker_threads').Worker;
	private tasks = new Map<string, DeferredPromise<Uint8Array>>();

	constructor(context: vscode.ExtensionContext) {
		super(context);
		context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('svgx.experimental.serialization')) {
				this.experimentalSave = vscode.workspace.getConfiguration('svgx').get('experimental.serialization', true);
			}
		}));
	}

	override dispose() {
		try {
			void this.worker?.terminate();
		} catch {
			//
		}
		super.dispose();
	}

	public override async serializeNotebook(data: vscode.NotebookData, token: vscode.CancellationToken): Promise<Uint8Array> {
		if (this.disposed) {
			return new Uint8Array(0);
		}

		if (this.experimentalSave) {
			return this.serializeViaWorker(data);
		}

		return super.serializeNotebook(data, token);
	}

	private async startWorker() {
		if (this.disposed) {
			throw new Error('Serializer disposed');
		}
		if (this.worker) {
			return this.worker;
		}
		const { Worker } = await import('node:worker_threads');
		const outputDir = getOutputDir(this.context);
		this.worker = new Worker(vscode.Uri.joinPath(this.context.extensionUri, outputDir, 'notebookSerializerWorker.js').fsPath, {});
		this.worker.on('exit', (exitCode) => {
			if (!this.disposed) {
				console.error(`SVGX Notebook Serializer Worker exited unexpectedly`, exitCode);
			}
			this.worker = undefined;
		});
		this.worker.on('message', (result: { data: Uint8Array; id: string }) => {
			const task = this.tasks.get(result.id);
			if (task) {
				task.complete(result.data);
				this.tasks.delete(result.id);
			}
		});
		this.worker.on('error', (err) => {
			if (!this.disposed) {
				console.error(`SVGX Notebook Serializer Worker errored unexpectedly`, err);
			}
		});
		return this.worker;
	}
	private async serializeViaWorker(data: vscode.NotebookData): Promise<Uint8Array> {
		const worker = await this.startWorker();
		const id = generateUuid();

		const deferred = new DeferredPromise<Uint8Array>();
		this.tasks.set(id, deferred);
		worker.postMessage({ data, id });

		return deferred.p;
	}
}


function getOutputDir(context: vscode.ExtensionContext): string {
	const main = context.extension.packageJSON.main as string;
	return main.indexOf('/dist/') !== -1 ? 'dist' : 'out';
}
