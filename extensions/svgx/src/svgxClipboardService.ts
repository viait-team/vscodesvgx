/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SvgxClipboardData } from './types'; // Assuming types are defined in types.ts (or types.d.ts)

/**
 * A singleton service for managing in-memory logical copy/paste operations
 * for SVGX elements. This avoids using the system clipboard and allows for
 * rich data transfer between editor instances within the same VS Code window.
 */
export class SvgxClipboardService {

	private _clipboardData: SvgxClipboardData | undefined = undefined;

	/**
	 * Sets the logical data to be held in memory. This is called by the "Copy" command.
	 * @param data The structured logical data copied from the webview.
	 */
	public setData(data: SvgxClipboardData): void {
		console.log('SVGXClipboardService: Setting data.', data);
		this._clipboardData = data;
	}

	/**
	 * Retrieves the logical data from memory. This is called by the "Paste" command.
	 * The data is consumed upon read (cleared) to mimic standard clipboard behavior.
	 * @returns The stored logical data, or undefined if the clipboard is empty.
	 */
	public getData(): SvgxClipboardData | undefined {
		console.log('SVGXClipboardService: Getting data.');
		const data = this._clipboardData;
		// NOTE: For a true single-use paste, you would clear the data here:
		// this._clipboardData = undefined;
		// For now, we'll allow multi-paste until the next copy operation.
		return data;
	}

	/**
	 * Checks if there is any logical data currently stored in the clipboard.
	 * This is useful for enabling/disabling the "Paste" command.
	 * @returns True if data exists, false otherwise.
	 */
	public hasData(): boolean {
		const has = !!this._clipboardData;
		console.log('SVGXClipboardService: Checking for data. Found:', has);
		return has;
	}

	/**
	 * Explicitly clears the clipboard data.
	 */
	public clear(): void {
		console.log('SVGXClipboardService: Clearing data.');
		this._clipboardData = undefined;
	}
}
