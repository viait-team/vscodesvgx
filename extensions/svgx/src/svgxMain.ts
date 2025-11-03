/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { SvgxEditorProvider } from './svgxEditorProvider';

export function activate(context: vscode.ExtensionContext) {
	console.log('SVGX Extension: activate() called');

	// Register the custom editor provider
	context.subscriptions.push(SvgxEditorProvider.register(context));

	console.log('SVGX Extension: SvgxEditorProvider registered');
}

export function deactivate() { }
