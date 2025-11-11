/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
//svgxMain.ts

import * as vscode from 'vscode';
import { SvgxEditorProvider } from './svgxEditorProvider';
import { SvgxClipboardService } from './svgxClipboardService'; // Import the new service

export function activate(context: vscode.ExtensionContext) {
	console.log('SVGX Extension: activate() called');

	// --- SVGX Logical Copy/Paste: START ---
	// Instantiate the clipboard service as a singleton for the entire extension.
	const clipboardService = new SvgxClipboardService();
	// --- SVGX Logical Copy/Paste: END ---

	// Register the custom editor provider, passing the singleton clipboard service instance.
	context.subscriptions.push(SvgxEditorProvider.register(context, clipboardService));

	console.log('SVGX Extension: SvgxEditorProvider registered');
}

export function deactivate() { }
