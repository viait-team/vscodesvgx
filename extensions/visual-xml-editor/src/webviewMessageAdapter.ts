/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { VisualXmlSerializerNode } from "./serializer/VisualXmlSerializerNode";

interface WebviewMessage {
	type: string;
	[key: string]: any;
}

/**
 * Minimal adapter that accepts existing full-document edits and a placeholder for incremental changes.
 * This adapter intentionally keeps behavior conservative: it applies full-document edits as before and
 * returns a clear error for incremental messages until full support is implemented.
 */
export async function processWebviewMessage(
	e: WebviewMessage,
	document: { uri: vscode.Uri },
	webviewPanel: vscode.WebviewPanel,
	serializer: VisualXmlSerializerNode,
	output: vscode.OutputChannel,
	context: vscode.ExtensionContext
) {
	try {
		switch (e.type) {
			case "edit": {
				const incoming = e.content as string;
				try { output.appendLine("adapter: webview -> edit (received)"); } catch { }
				const model = serializer.deserialize(incoming);
				const serialized = serializer.serialize(model);
				const edit = new vscode.WorkspaceEdit();
				edit.replace(document.uri, new vscode.Range(0, 0, 9999, 9999), serialized);
				await vscode.workspace.applyEdit(edit);
				try { output.appendLine("adapter: applyEdit invoked"); } catch { }
				break;
			}
			case "incremental": {
				try { output.appendLine("adapter: incremental message received (not implemented)"); } catch { }
				// Inform the webview that incremental is not yet applied
				try { webviewPanel.webview.postMessage({ type: "saveAck", status: "error", details: "incremental not implemented yet" }); } catch { }
				break;
			}
			case "fullDocument": {
				// Legacy/explicit full document message
				const xml = e.xml as string;
				const model = serializer.deserialize(xml);
				const serialized = serializer.serialize(model);
				const edit = new vscode.WorkspaceEdit();
				edit.replace(document.uri, new vscode.Range(0, 0, 9999, 9999), serialized);
				await vscode.workspace.applyEdit(edit);
				try { webviewPanel.webview.postMessage({ type: "saveAck", status: "ok" }); } catch { }
				break;
			}
			case "requestSave": {
				// The webview is asking the extension to run a save flow. For now, respond with a request to send full document.
				try { webviewPanel.webview.postMessage({ type: "requestFullDocument" }); } catch { }
				break;
			}
			default: {
				try { output.appendLine("adapter: unknown message type: " + String(e.type)); } catch { }
			}
		}
	} catch (err) {
		console.error("adapter failed processing message", err);
	}
}

export default { processWebviewMessage };
