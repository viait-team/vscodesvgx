/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// --- SVGX Logical Copy/Paste Definitions ---

/**
 * Augments the global Window interface for the webview context.
 * This lets TypeScript know about the custom `svgxLogicalOps` property
 * that we attach for managing SVG operations.
 */
declare global {
	interface Window {
		/**
		 * An instance of the SvgxLogicalOperations class, providing a centralized
		 * API for all complex DOM-based logic within the webview.
		 */
		svgxLogicalOps: any; // Using 'any' is simplest, but could be a specific class type
	}
}

/**
 * Defines the structure for the rich data object that is stored in the
 * SvgxClipboardService for in-memory copy/paste operations.
 */
export interface SvgxClipboardData {
	/**
	 * A unique identifier to validate that the clipboard content
	 * originated from our SVGX extension.
	 */
	source: "svgx-logical-copy";

	/**
	 * Contains information about the copied SVG element itself.
	 */
	element: {
		tagName: string;
		/**
		 * A key-value map of all non-coordinate attributes (e.g., stroke, fill)
		 * to be preserved on paste.
		 */
		attributes: { [key: string]: string };
		/**
		 * An array of the element's geometry points, converted from the source
		 * SVG's user coordinates into the shared logical coordinate system.
		 */
		logicalPoints: { x: number; y: number }[];
	};

	/**
	 * Contains the complete markup for the legend entries associated with the
	 * copied element.
	 */
	legendData: {
		/**
		 * The unique ID of the legend concept (e.g., "ust_10y_hjm_simulation_mean").
		 */
		id: string;
		/**
		 * The full outerHTML of the definitional <text> element for this legend entry.
		 */
		definitionElement: string;
		/**
		 * An array containing the full outerHTML of all visual instance elements
		 * (symbols, containers) for this legend entry.
		 */
		instanceElements: string[];
	}[];
}

// Note: Additional message types for webview <-> host communication can be added below.
