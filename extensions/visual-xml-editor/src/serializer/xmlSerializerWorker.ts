/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// xmlSerializerWorker.ts
// Worker used to compute conservative positional metadata. It MUST NOT reserialize
// or normalize the XML content. The canonical file text is always returned verbatim.

import { parentPort } from 'worker_threads';

type ReqDeserialize = { id: string; action: 'deserialize'; content: string };
type ReqSerialize = { id: string; action: 'serialize'; model: { content: string } };
type ReqIndex = { id: string; action: 'index'; content: string; opts?: { scanForIds?: boolean } };
type Request = ReqDeserialize | ReqSerialize | ReqIndex;
type Resp = { id: string; result?: any; error?: string };

type ElementIndex = {
	id?: string;
	tag: string;
	tagStart: number;
	tagEnd: number;
	attrs: Record<string, { valueStart: number; valueEnd: number }>;
};

/**
 * Build a conservative index of start-tags and attribute value offsets.
 * This intentionally avoids parsing into a DOM and preserves byte offsets
 * relative to the original content string.
 */
function buildIndex(content: string, scanForIds = true): ElementIndex[] {
	const out: ElementIndex[] = [];
	// Match start-tags like <tag ...> (including self-closing). Avoid end-tags </...>
	const tagRegex = /<([A-Za-z0-9:_-]+)\b([^>]*)>/g;
	let m: RegExpExecArray | null;
	while ((m = tagRegex.exec(content)) !== null) {
		const tag = m[1];
		const attrsText = m[2] || '';
		const tagStart = m.index;
		const tagEnd = m.index + m[0].length;
		const attrs: Record<string, { valueStart: number; valueEnd: number }> = {};

		// Find attributes inside the tag text. Support single and double quotes.
		const attrRegex = /\b([A-Za-z_:][A-Za-z0-9:_.-]*)\s*=\s*(['"])([\s\S]*?)\2/g;
		let am: RegExpExecArray | null;
		while ((am = attrRegex.exec(attrsText)) !== null) {
			const attrName = am[1];
			const val = am[3];
			// compute offsets relative to whole document
			const attrsTextStartInDoc = tagStart + m[0].indexOf(attrsText);
			const valueStart = attrsTextStartInDoc + am.index + am[0].indexOf(am[2]) + 1;
			const valueEnd = valueStart + val.length;
			attrs[attrName] = { valueStart, valueEnd };
		}

		const rec: ElementIndex = { tag, tagStart, tagEnd, attrs };
		if (scanForIds) {
			const idAttr = attrs['id'] || attrs['ID'] || attrs['Id'];
			if (idAttr) {
				rec.id = content.slice(idAttr.valueStart, idAttr.valueEnd);
			}
		}
		out.push(rec);
	}
	return out;
}

if (parentPort) {
	parentPort.on('message', (msg: Request) => {
		(async () => {
			try {
				if (msg.action === 'deserialize') {
					// Return the original content verbatim and a conservative index for lookups.
					const content = msg.content;
					const index = buildIndex(content, true);
					const resp: Resp = { id: msg.id, result: { content, index } };
					parentPort?.postMessage(resp);
				} else if (msg.action === 'serialize') {
					// Echo model.content back; DO NOT reserialize or normalize it here.
					const resp: Resp = { id: msg.id, result: { content: msg.model.content } };
					parentPort?.postMessage(resp);
				} else if (msg.action === 'index') {
					const index = buildIndex(msg.content, !!msg.opts?.scanForIds);
					const resp: Resp = { id: msg.id, result: { index } };
					parentPort?.postMessage(resp);
				} else {
					const resp: Resp = { id: (msg as any).id, error: 'Unknown action' };
					parentPort?.postMessage(resp);
				}
			} catch (err: any) {
				const resp: Resp = { id: (msg as any).id, error: String(err && err.message ? err.message : err) };
				parentPort?.postMessage(resp);
			}
		})();
	});
}
