/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// VisualXmlSerializerNode.ts
import * as vscode from 'vscode';
import { VisualXmlSerializerBase, DocumentModel, ByteRange, AttributeEditDescriptor, ElementIndex } from './VisualXmlSerializerBase';
import { DeferredPromise, generateUuid } from './helper';

type WorkerRequest =
	| { id: string; action: 'deserialize'; content: string }
	| { id: string; action: 'serialize'; model: { content: string } }
	| { id: string; action: 'index'; content: string; opts?: { scanForIds?: boolean } };

type WorkerResp = { id: string; result?: any; error?: string };

/**
 * Node implementation following the Markdown-style, text-first pattern:
 * - deserialize returns the original text verbatim and a conservative index (if available)
 * - serialize returns model.content (no lossy DOM reserialization)
 * - findAttributeRange locates attribute value byte ranges using the index or a safe anchored search
 */
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

	/**
	 * Preserve original text and ask worker for a conservative index.
	 */
	public async deserialize(content: string): Promise<DocumentModel> {
		try {
			const worker = await this.startWorker();
			const id = generateUuid();
			const deferred = new DeferredPromise<any>();
			this.tasks.set(id, deferred);
			const req: WorkerRequest = { id, action: 'deserialize', content };
			worker.postMessage(req);
			const res = await deferred.p;
			// Expect { content, index? } from worker. Ensure content verbatim.
			const doc: DocumentModel = { content: res.content, index: res.index as ElementIndex[] | undefined };
			return doc;
		} catch (err) {
			// On worker failure, return verbatim content without index
			return { content };
		}
	}

	/**
	 * Default serialize: return the canonical text. Extension host must apply minimal
	 * TextEdits using findAttributeRange to preserve formatting.
	 */
	public async serialize(model: DocumentModel): Promise<string> {
		// Do not reserialize via DOM here. Return the canonical text.
		return model.content;
	}

	/**
	 * Find the byte range for an attribute value. Prefer using the index if present.
	 * Returns null when unable to unambiguously locate the attribute.
	 */
	public async findAttributeRange(model: DocumentModel, edit: AttributeEditDescriptor): Promise<ByteRange | null> {
		// 1) Try index lookup
		const idx = model.index;
		if (idx && idx.length > 0) {
			// prefer id-based lookup
			const id = edit.selector.id;
			if (id) {
				for (const rec of idx) {
					if (rec.id === id) {
						const attr = rec.attrs[edit.attrName];
						if (attr) return { start: attr.valueStart, end: attr.valueEnd };
						return null;
					}
				}
			}
			// fallback: tag + occurrence
			if (edit.selector.tag) {
				const occ = edit.selector.occurrence ?? 0;
				let found = 0;
				for (const rec of idx) {
					if (rec.tag === edit.selector.tag) {
						if (found++ === occ) {
							const attr = rec.attrs[edit.attrName];
							if (attr) return { start: attr.valueStart, end: attr.valueEnd };
							return null;
						}
					}
				}
			}
		}

		// 2) Fallback: conservative anchored search in the document text (id -> tag -> fail)
		const text = model.content;
		// If id provided, anchor to id occurrence and expand to enclosing start-tag
		if (edit.selector.id) {
			const idRegex = new RegExp(`\\b(id)\\s*=\\s*(['"])${escapeRegExp(edit.selector.id)}\\2`, 'g');
			let m;
			let found = 0;
			while ((m = idRegex.exec(text)) !== null) {
				if (found++ < (edit.selector.occurrence ?? 0)) continue;
				const idIndex = m.index;
				const tagStart = text.lastIndexOf('<', idIndex);
				const tagEnd = text.indexOf('>', idIndex);
				if (tagStart === -1 || tagEnd === -1) continue;
				const tagText = text.slice(tagStart, tagEnd + 1);
				const rel = this.findAttrInTagText(tagText, edit.attrName);
				if (!rel) continue;
				return { start: tagStart + rel.start, end: tagStart + rel.end };
			}
			return null;
		}

		// If tag + occurrence provided, find nth start tag
		if (edit.selector.tag) {
			const tagRegex = new RegExp(`<${escapeRegExp(edit.selector.tag)}\\b([^>]*)>`, 'g');
			let m;
			let found = 0;
			while ((m = tagRegex.exec(text)) !== null) {
				if (found++ < (edit.selector.occurrence ?? 0)) continue;
				const tagStart = m.index;
				const tagText = m[0];
				const rel = this.findAttrInTagText(tagText, edit.attrName);
				if (!rel) continue;
				return { start: tagStart + rel.start, end: tagStart + rel.end };
			}
			return null;
		}

		// cannot locate reliably
		return null;
	}

	/**
	 * Helper: given a start-tag text like '<circle cx="10" cy="10">' return
	 * the start/end offsets (relative to tagText) of the attribute's value (inside quotes),
	 * or null when not found.
	 */
	private findAttrInTagText(tagText: string, attrName: string): { start: number; end: number } | null {
		const attrPattern = new RegExp(`\\b${escapeRegExp(attrName)}\\s*=\\s*(['"])([\\s\\S]*?)\\1`);
		const am = attrPattern.exec(tagText);
		if (!am) return null;
		const quoteIndexInMatch = am[0].indexOf(am[1]);
		const valueStart = am.index + quoteIndexInMatch + 1;
		const valueEnd = valueStart + am[2].length;
		return { start: valueStart, end: valueEnd };
	}

	/**
	 * Start worker and wire message handling. Worker follows the new contract:
	 * - 'deserialize' returns { content, index }
	 * - 'index' returns { index }
	 * - 'serialize' echoes back { content }
	 */
	private async startWorker() {
		if (this.worker) {
			return this.worker;
		}
		const { Worker } = await import('node:worker_threads');
		const outputDir = this.getOutputDir();
		const workerPath = vscode.Uri.joinPath(this.context?.extensionUri ?? vscode.Uri.file('.'), outputDir, 'serializer', 'xmlSerializerWorker.js').fsPath;
		this.worker = new Worker(workerPath, {});
		this.worker.on('message', (msg: WorkerResp) => {
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
		// Development output uses 'out' and packaged builds use 'dist'.
		return 'out';
	}
}

/* Helpers that do not depend on VS Code types */
function escapeRegExp(s: string) {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
