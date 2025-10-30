/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { parentPort } from 'worker_threads';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';
if (parentPort) {
    parentPort.on('message', (msg) => {
        try {
            if (msg.action === 'deserialize') {
                const parser = new XMLParser();
                const jsonObj = parser.parse(msg.content);
                const builder = new XMLBuilder({});
                const newContent = builder.build(jsonObj);
                const resp = { id: msg.id, result: { content: newContent } };
                parentPort?.postMessage(resp);
            }
            else if (msg.action === 'serialize') {
                // Currently model is a thin wrapper around content; echo it back.
                const resp = { id: msg.id, result: { content: msg.model.content } };
                parentPort?.postMessage(resp);
            }
        }
        catch (err) {
            const resp = { id: msg.id, error: String(err && err.message ? err.message : err) };
            parentPort?.postMessage(resp);
        }
    });
}
