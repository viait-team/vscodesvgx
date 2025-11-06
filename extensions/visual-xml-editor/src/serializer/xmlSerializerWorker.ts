/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { parentPort } from 'worker_threads';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';

type ReqDeserialize = { id: string; action: 'deserialize'; content: string };
type ReqSerialize = { id: string; action: 'serialize'; model: { content: string } };
type Request = ReqDeserialize | ReqSerialize;

type Resp = { id: string; result?: any; error?: string };

if (parentPort) {
	parentPort.on('message', (msg: Request) => {
		try {
			if (msg.action === 'deserialize') {
				// Extract original XML declaration
				const xmlDeclMatch = msg.content.match(/^\s*<\?xml[^?]*\?>/);
				const originalXmlDecl = xmlDeclMatch ? xmlDeclMatch[0] : '';

				// Remove XML declaration for parsing
				const contentWithoutDecl = msg.content.replace(/^\s*<\?xml[^?]*\?>/, '').trim();

				const parser = new XMLParser();
				const jsonObj = parser.parse(contentWithoutDecl);
				const builder = new XMLBuilder({});
				const newContent = builder.build(jsonObj);

				// Add correct XML declaration if missing, or restore original
				const finalContent = originalXmlDecl
					? originalXmlDecl + '\n' + newContent
					: '<?xml version="1.0" encoding="UTF-8"?>\n' + newContent;

				const resp: Resp = { id: msg.id, result: { content: finalContent } };
				parentPort?.postMessage(resp);
			} else if (msg.action === 'serialize') {
				// Currently model is a thin wrapper around content; echo it back.
				const resp: Resp = { id: msg.id, result: { content: msg.model.content } };
				parentPort?.postMessage(resp);
			}
		} catch (err: any) {
			const resp: Resp = { id: (msg as any).id, error: String(err && err.message ? err.message : err) };
			parentPort?.postMessage(resp);
		}
	});
}
