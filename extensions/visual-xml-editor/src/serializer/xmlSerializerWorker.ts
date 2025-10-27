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
				const parser = new XMLParser();
				const jsonObj = parser.parse(msg.content);
				const builder = new XMLBuilder({});
				const newContent = builder.build(jsonObj);
				const resp: Resp = { id: msg.id, result: { content: newContent } };
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
