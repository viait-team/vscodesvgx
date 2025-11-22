/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import { DOMParser } from '@xmldom/xmldom';

export class SvgxFileDecorationProvider implements vscode.FileDecorationProvider {

	private readonly _onDidChangeFileDecorations = new vscode.EventEmitter<vscode.Uri | vscode.Uri[]>();
	readonly onDidChangeFileDecorations = this._onDidChangeFileDecorations.event;

	constructor() { }

	async provideFileDecoration(uri: vscode.Uri): Promise<vscode.FileDecoration | undefined> {
		// Only check .svgx and .svg files
		if (!uri.path.endsWith('.svgx') && !uri.path.endsWith('.svg')) {
			return undefined;
		}

		try {
			// Read file content
			// Note: For performance, we might want to cache this or use a lighter parsing method
			// but for now, reading the file is the most reliable way to check content.
			const uint8Array = await vscode.workspace.fs.readFile(uri);
			const content = new TextDecoder().decode(uint8Array);

			// Parse XML
			const doc = new DOMParser().parseFromString(content, 'application/xml');
			const svg = doc.getElementsByTagName('svg')[0];

			if (svg) {
				const hasXlm = svg.hasAttribute('xlm');
				const hasYlm = svg.hasAttribute('ylm');

				if (hasXlm || hasYlm) {
					return {
						badge: 'L', // 'L' for Logical
						tooltip: 'Contains Logical Mapping (xlm/ylm)',
						color: new vscode.ThemeColor('charts.blue')
					};
				}
			}
		} catch (error) {
			console.error('SVGX FileDecorationProvider error:', error);
		}

		return undefined;
	}

	public fire(uri: vscode.Uri) {
		this._onDidChangeFileDecorations.fire(uri);
	}
}
