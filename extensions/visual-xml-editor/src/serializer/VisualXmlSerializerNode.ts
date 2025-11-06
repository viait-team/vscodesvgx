/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { VisualXmlSerializerBase, DocumentModel } from './VisualXmlSerializerBase';
import { DeferredPromise, generateUuid } from './helper';

export class VisualXmlSerializerNode extends VisualXmlSerializerBase {
	private worker?: import('node:worker_threads').Worker;
	private tasks = new Map<string, DeferredPromise<any>>();
	private context?: vscode.ExtensionContext;

	constructor(context?: vscode.ExtensionContext) {
		super();
		this.context = context;
	}

	public dispose() {
		try {
			void this.worker?.terminate();
		} catch {
			// ignore
		}
	}

	public async deserialize(content: string): Promise<DocumentModel> {
		try {
			const worker = await this.startWorker();
			const id = generateUuid();
			const deferred = new DeferredPromise<any>();
			this.tasks.set(id, deferred);
			worker.postMessage({ id, action: 'deserialize', content });
			const res = await deferred.p;
			return { content: res.content };
		} catch (err) {
			// fallback: do a local parse if worker fails
			try {
				const { XMLParser, XMLBuilder } = await import('fast-xml-parser');
				const parser = new XMLParser();
				const jsonObj = parser.parse(content);
				const builder = new XMLBuilder({});
				const newContent = builder.build(jsonObj);
				return { content: newContent };
			} catch (e) {
				// as last resort, return original content
				return { content };
			}
		}
	}

	public async serialize(model: DocumentModel): Promise<string> {
		try {
			const worker = await this.startWorker();
			const id = generateUuid();
			const deferred = new DeferredPromise<any>();
			this.tasks.set(id, deferred);
			worker.postMessage({ id, action: 'serialize', model });
			const res = await deferred.p;
			return res.content;
		} catch (err) {
			// fallback: model currently wraps content directly
			return model.content;
		}
	}

	private async startWorker() {
		if (this.worker) {
			return this.worker;
		}
		const { Worker } = await import('node:worker_threads');
		const outputDir = this.getOutputDir();
		// worker script is emitted next to extension main (out or dist)
		const workerPath = vscode.Uri.joinPath(this.context?.extensionUri ?? vscode.Uri.file('.'), outputDir, 'serializer', 'xmlSerializerWorker.js').fsPath;
		this.worker = new Worker(workerPath, {});
		this.worker.on('message', (msg: { id: string; result?: any; error?: string }) => {
			const task = this.tasks.get(msg.id);
			if (task) {
				if (msg.error) {
					task.error(new Error(msg.error));
				} else {
					task.complete(msg.result);
				}
				this.tasks.delete(msg.id);
			}
		});
		this.worker.on('exit', (code) => {
			if (code !== 0) {
				console.error('VisualXmlSerializer worker exited with code', code);
			}
			this.worker = undefined;
		});
		this.worker.on('error', (err) => {
			console.error('VisualXmlSerializer worker error', err);
		});
		return this.worker;
	}

	private getOutputDir(): string {
		// Development output uses 'out' and packaged builds use 'dist'. For now
		// default to 'out' which matches the dev workflow.
		return 'out';
	}
}
