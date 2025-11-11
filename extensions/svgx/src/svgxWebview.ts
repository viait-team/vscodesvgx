/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
//svgxwebview.ts

console.log('SVGX: webview script loading...');

declare const d3: any;

// VS Code webview API
interface WebviewApi {
	postMessage(message: any): void;
	getState(): any;
	setState(state: any): void;
}

declare const acquireVsCodeApi: () => WebviewApi;
const svgxVscode = acquireVsCodeApi();

function svgxSafePostMessage(msg: any): void {
	svgxVscode.postMessage(msg);
}

// SVGX visual editor (following previewWebview.ts pattern)
window.addEventListener('message', (event: MessageEvent) => {
	console.log('SVGX: Message event listener initialized and received message:', event.data?.type);
	const message = event.data;
	switch (message.type) {
		case 'init':
			console.debug('svgx: init received');
			svgxRenderRoot(message.content, true);
			try {
				if (message.theme === 'dark') { document.documentElement.classList.add('svgx-theme-dark'); }
				else { document.documentElement.classList.remove('svgx-theme-dark'); }
			} catch { }
			break;
		case 'update':
			console.debug('svgx: update received');
			svgxRenderRoot(message.text, true);
			try {
				if (message.theme === 'dark') { document.documentElement.classList.add('svgx-theme-dark'); }
				else { document.documentElement.classList.remove('svgx-theme-dark'); }
			} catch { }
			break;
		case 'theme':
			try {
				if (message.theme === 'dark') { document.documentElement.classList.add('svgx-theme-dark'); }
				else { document.documentElement.classList.remove('svgx-theme-dark'); }
			} catch { }
			break;
		case 'flashElement':
			svgxFlashElement(message.elementId || message.selector);
			break;
		// --- SVGX Logical Copy/Paste: START ---
		// Handle messages from the extension host to trigger logical operations
		case 'getCopyDataRequest':
			if (window.svgxLogicalOps) {
				const copyData = window.svgxLogicalOps.getLogicalCopyData();
				svgxSafePostMessage({ type: 'copyDataResponse', payload: copyData });
			}
			break;
		case 'pasteDataRequest':
			if (window.svgxLogicalOps && message.payload) {
				const newSvgString = window.svgxLogicalOps.pasteLogicalData(message.payload);
				// This response will be handled by the extension host to persist the change
				svgxSafePostMessage({ type: 'documentUpdate', payload: newSvgString });
			}
			break;
		// --- SVGX Logical Copy/Paste: END ---
	}
});

let svgxCurrentDoc: Document | null = null;
const svgxSelectedNode: Element | null = null;

function svgxShowStatus(msg: string, timeout: number = 2500): void {
	try {
		let s = document.getElementById('svgx-status');
		if (!s) {
			s = document.createElement('div');
			s.id = 'svgx-status';
			s.style.position = 'fixed';
			s.style.top = '8px';
			s.style.left = '50%';
			s.style.transform = 'translateX(-50%)';
			s.style.background = 'rgba(60,60,60,0.95)';
			s.style.color = '#fff';
			s.style.padding = '6px 10px';
			s.style.borderRadius = '4px';
			s.style.zIndex = '10000';
			document.body.appendChild(s);
		}
		s.textContent = msg;
		s.style.display = '';
		setTimeout(() => { s!.style.display = 'none'; }, timeout);
	} catch (e) { /* ignore */ }
}

function svgxRenderRoot(xmlText: string, _visualEditor: boolean): void {
	console.log('SVGX: svgxRenderRoot function called');
	const parser = new DOMParser();
	const doc = parser.parseFromString(xmlText, 'application/xml');
	svgxCurrentDoc = doc;
	const root = document.getElementById('root');
	if (!root) { console.warn('svgx: missing root element'); return; }
	root.innerHTML = xmlText;
	console.log('svg doc is loaded');

	// Initialize D3.js for visual enhancements
	svgxInitializeD3Enhancement();

	// Setup click handlers for editor sync
	svgxSetupClickHandlers(null);

	// --- SVGX Logical Copy/Paste: START ---
	// Instantiate the logical operations engine for this document
	if (root.querySelector('svg')) {
		window.svgxLogicalOps = new SvgxLogicalOperations(root.querySelector('svg')!);
	}
	// --- SVGX Logical Copy/Paste: END ---
}

// D3.js Enhancement Functions for SVGX
function svgxInitializeD3Enhancement(): void {
	console.log('SVGX: svgxInitializeD3Enhancement function called');
	console.log('SVGX D3.js initialization starting...');
	// Dynamically load d3.js if not already loaded
	if (typeof (window as any).d3 === 'undefined') {
		console.log('SVGX D3.js not found, attempting to load from CDN...');
		const script = document.createElement('script');
		script.src = 'https://d3js.org/d3.v7.min.js';
		script.onload = () => {
			console.log('SVGX D3.js loaded dynamically, version:', (window as any).d3.version);
			svgxSetupD3Functionality();
		};
		script.onerror = (error) => {
			console.error('SVGX failed to load D3.js from CDN:', error);
			console.warn('SVGX failed to load D3.js from CDN, visual features disabled');
		};
		document.head.appendChild(script);
		console.log('SVGX D3.js script element added to head');
	} else {
		console.log('SVGX D3.js already available, version:', (window as any).d3.version);
		svgxSetupD3Functionality();
	}
}

function svgxSetupD3Functionality(): void {
	console.log('SVGX: svgxSetupD3Functionality function called');
	const rootContainer = d3.select('#root');
	const svg = rootContainer.select('svg');

	if (svg.empty()) {
		console.warn('SVGX SVG element not found for D3 zoom/pan');
		return;
	}

	// Apply zoom/pan to the root div container, not the SVG itself
	const zoom = d3.zoom()
		.on('zoom', (event: any) => {
			// Apply transform to the SVG element via CSS transform
			svg.style('transform',
				`translate(${event.transform.x}px, ${event.transform.y}px) scale(${event.transform.k})`);
		});

	// Attach zoom behavior to the root container
	rootContainer.call(zoom);

	console.log('SVGX D3.js zoom and pan enabled on container div');
	svgxShowStatus('SVGX Editor initialized with D3.js v' + d3.version);

	// Setup click handlers on the original SVG (no wrapping needed)
	svgxSetupClickHandlers(svg);
}

function svgxSetupClickHandlers(selection: any): void {
	if (!selection || selection.empty()) {
		console.warn('SVGX: Invalid selection for click handlers');
		return;
	}

	selection.selectAll('*').on('click', (event: MouseEvent) => {
		event.stopPropagation(); // Prevent zoom from interfering with clicks
		const target = event.target as Element;
		console.log('SVGX: Element clicked for selection hint:', target.tagName);

		// Instead of sending a message, we now provide a direct visual hint by flashing the element.
		// This avoids triggering the 'dirty' state and the disposable leak.
		if (target) {
			svgxFlashElement(target);
		}
	});
}


// --- FIX: Refactor this function to accept either a selector string OR a direct element reference.
function svgxFlashElement(elementOrSelector: string | Element): void {
	const d3 = (window as any).d3;
	if (typeof d3 === 'undefined') {
		console.log('SVGX: D3.js not available, cannot flash element');
		svgxShowStatus('D3.js flashing not available');
		return;
	}

	console.log('SVGX: Executing flash animation');

	let element: any; // This will hold the d3 selection

	// Check if we were given a string (selector) or an object (element)
	if (typeof elementOrSelector === 'string') {
		// Try to find element by various selectors
		element = d3.select(elementOrSelector);
		// If not found by selector, try as ID
		if (element.empty() && !elementOrSelector.startsWith('#')) {
			element = d3.select('#' + elementOrSelector);
		}
	} else {
		// We were given a direct element reference
		element = d3.select(elementOrSelector);
	}


	if (element.empty()) {
		console.warn('SVGX element not found for flashing:', elementOrSelector);
		svgxShowStatus('Element not found for flashing');
		return;
	}

	console.log('SVGX flashing element:', element.node());
	svgxShowStatus('Flashing element...');

	// Save original styles
	const originalStroke = element.style('stroke');
	const originalStrokeWidth = element.style('stroke-width');
	const originalFillOpacity = element.style('fill-opacity');

	// Create D3.js flashing animation
	element.transition()
		.duration(300)
		.style('stroke', '#ff4757')
		.style('stroke-width', '4px')
		.style('fill-opacity', '0.7')
		.transition()
		.duration(300)
		.style('stroke', '#ffa502')
		.style('stroke-width', '6px')
		.style('fill-opacity', '1.0')
		.transition()
		.duration(300)
		.style('stroke', '#ff4757')
		.style('stroke-width', '4px')
		.style('fill-opacity', '0.7')
		.transition()
		.duration(300)
		.style('stroke', originalStroke)
		.style('stroke-width', originalStrokeWidth)
		.style('fill-opacity', originalFillOpacity);
}



function svgxExtractElementInfo(node: Element): { tagName: string; id?: string; className?: string; keyAttributes?: Record<string, string> } | null {
	if (!node) { return null; }

	const tagName = node.nodeName;
	const id = node.getAttribute('id') || undefined;
	const className = node.getAttribute('class') || undefined;

	// Extract key attributes for matching when no ID
	const keyAttributes: Record<string, string> = {};
	if (!id && node.attributes) {
		// For common SVG elements, extract identifying attributes
		switch (tagName.toLowerCase()) {
			case 'circle':
				svgxAddAttribute(node, 'cx', keyAttributes);
				svgxAddAttribute(node, 'cy', keyAttributes);
				svgxAddAttribute(node, 'r', keyAttributes);
				break;
			case 'rect':
				svgxAddAttribute(node, 'x', keyAttributes);
				svgxAddAttribute(node, 'y', keyAttributes);
				svgxAddAttribute(node, 'width', keyAttributes);
				svgxAddAttribute(node, 'height', keyAttributes);
				break;
			case 'path':
				svgxAddAttribute(node, 'd', keyAttributes);
				break;
			case 'polygon':
				svgxAddAttribute(node, 'points', keyAttributes);
				break;
		}
	}

	return { tagName, id, className, keyAttributes };
}

function svgxAddAttribute(node: Element, attrName: string, keyAttributes: Record<string, string>): void {
	const value = node.getAttribute(attrName);
	if (value) {
		keyAttributes[attrName] = value;
	}
}

// --- SVGX Logical Copy/Paste: START ---

/**
 * Main class for handling all SVG logical operations within the webview.
 */
class SvgxLogicalOperations {
	private svgRoot: SVGSVGElement;
	private currentlySelectedElement: SVGPathElement | null = null;

	constructor(svgElement: SVGSVGElement) {
		this.svgRoot = svgElement;
		this.initializeSelectionHandling();
	}

	/**
	 * Task 1: Implements Path Selection Logic.
	 * Adds click listeners to all path elements for selection.
	 */
	public initializeSelectionHandling(): void {
		const paths = this.svgRoot.querySelectorAll('path');
		paths.forEach(path => {
			path.addEventListener('click', (event) => {
				event.stopPropagation();

				// Deselect previous element
				if (this.currentlySelectedElement) {
					this.currentlySelectedElement.classList.remove('selected');
				}

				// Select new element
				this.currentlySelectedElement = path;
				this.currentlySelectedElement.classList.add('selected');

				// Add a simple visual style for selection
				const styleId = 'svgx-selection-style';
				if (!document.getElementById(styleId)) {
					const style = document.createElement('style');
					style.id = styleId;
					style.innerHTML = `
						.selected {
							stroke: #00a8ff !important;
							stroke-width: 3px !important;
							stroke-dasharray: 5, 5;
						}
					`;
					document.head.appendChild(style);
				}

				svgxShowStatus('Path selected for logical copy.', 1500);
			});
		});
	}

	/**
	 * Task 2: Implements the getLogicalCopyData() Method.
	 * This is the core of the "Copy" operation, executed entirely in the webview.
	 */
	public getLogicalCopyData(): object | null {
		if (!this.currentlySelectedElement) {
			svgxShowStatus('No path selected to copy.', 2000);
			return null;
		}

		const element = this.currentlySelectedElement;

		// 1. Get CTM
		const ctm = (element as SVGGraphicsElement).getCTM();
		if (!ctm) {
			console.error('SVGX Error: Could not get CTM for selected element.');
			return null;
		}

		// 2. Find closest logical mapping definition
		const mappingElement = element.closest('[svgx\\:xlm][svgx\\:ylm]') || this.svgRoot;
		const xlmAttr = mappingElement.getAttribute('svgx:xlm');
		const ylmAttr = mappingElement.getAttribute('svgx:ylm');
		if (!xlmAttr || !ylmAttr) {
			console.error('SVGX Error: No svgx:xlm/ylm mapping found on element or ancestors.');
			return null;
		}

		const xlm = JSON.parse(xlmAttr);
		const ylm = JSON.parse(ylmAttr);

		// 3. Convert path points to logical coordinates
		// (This is a simplified example for M and L commands; a full implementation needs a proper path parser)
		const d = element.getAttribute('d') || '';
		const logicalPoints: { x: number, y: number }[] = [];
		// NOTE: A robust implementation requires a full path data parser. This is a placeholder.
		const commands = d.match(/[a-zA-Z][^a-zA-Z]*/g) || [];
		commands.forEach(cmdStr => {
			const command = cmdStr[0];
			const points = (cmdStr.slice(1).match(/-?\d+(\.\d+)?/g) || []).map(parseFloat);
			if ((command === 'M' || command === 'L') && points.length === 2) {
				const pt = this.svgRoot.createSVGPoint();
				pt.x = points[0];
				pt.y = points[1];

				const transformedPt = pt.matrixTransform(ctm);

				const logicalX = this._toLogical(transformedPt.x, xlm[0], xlm[1], xlm[2], xlm[3]);
				const logicalY = this._toLogical(transformedPt.y, ylm[0], ylm[1], ylm[2], ylm[3]);
				logicalPoints.push({ x: logicalX, y: logicalY });
			}
		});

		// 4. Get legend data
		const legendRefAttr = element.getAttribute('lc_legend_ref');
		const legendData: any[] = [];
		if (legendRefAttr) {
			try {
				const legendIds = JSON.parse(legendRefAttr.replace(/'/g, '"'));
				legendIds.forEach((id: string) => {
					const defElement = this.svgRoot.querySelector(`text[lc_legend_id="${id}"]`);
					const instElements = this.svgRoot.querySelectorAll(`*[lc_legend_instance="${id}"]`);

					if (defElement) {
						legendData.push({
							id: id,
							definitionElement: defElement.outerHTML,
							instanceElements: Array.from(instElements).map(el => el.outerHTML)
						});
					}
				});
			} catch (e) {
				console.error('SVGX Error parsing lc_legend_ref:', e);
			}
		}

		// 5. Package data
		const attributes: { [key: string]: string } = {};
		for (let i = 0; i < element.attributes.length; i++) {
			const attr = element.attributes[i];
			if (attr.name !== 'd' && attr.name !== 'class') { // Exclude 'd' and selection class
				attributes[attr.name] = attr.value;
			}
		}

		const clipboardData = {
			source: "svgx-logical-copy",
			element: {
				tagName: element.tagName,
				attributes: attributes,
				logicalPoints: logicalPoints,
			},
			legendData: legendData
		};

		svgxShowStatus('Logical data copied!', 1500);
		return clipboardData;
	}

	/**
	 * Task 3: Implements the pasteLogicalData() Method.
	 * This is the core of the "Paste" operation, executed entirely in the webview.
	 */
	public pasteLogicalData(clipboardData: any): string | null {
		// 1. Get target mapping
		const mappingElement = this.svgRoot; // Pasting is global for now
		const xlmAttr = mappingElement.getAttribute('svgx:xlm');
		const ylmAttr = mappingElement.getAttribute('svgx:ylm');
		if (!xlmAttr || !ylmAttr) {
			console.error('SVGX Error: No svgx:xlm/ylm mapping found on target SVG.');
			return null;
		}

		const targetXlm = JSON.parse(xlmAttr);
		const targetYlm = JSON.parse(ylmAttr);

		// 2. Convert logical points to target user coordinates
		const logicalPoints = clipboardData.element.logicalPoints;
		// NOTE: Simplified path string construction, assumes only M and L commands
		const d = logicalPoints.map((pt: any, i: number) => {
			const userX = this._fromLogical(pt.x, targetXlm[0], targetXlm[1], targetXlm[2], targetXlm[3]);
			const userY = this._fromLogical(pt.y, targetYlm[0], targetYlm[1], targetYlm[2], targetYlm[3]);
			return (i === 0 ? 'M' : 'L') + `${userX} ${userY}`;
		}).join(' ');

		// 3. Create new elements
		const pasteContainer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
		pasteContainer.setAttribute('class', 'pasted-element');

		const newPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		newPath.setAttribute('d', d);
		Object.keys(clipboardData.element.attributes).forEach(key => {
			newPath.setAttribute(key, clipboardData.element.attributes[key]);
		});

		pasteContainer.appendChild(newPath);

		// 4. Handle Legend Pasting
		const legendContainer = this.svgRoot.querySelector('g[id*="legend"]');
		if (legendContainer) { // Case 1: Existing Legend Box
			clipboardData.legendData.forEach((legend: any) => {
				const alreadyExists = legendContainer.querySelector(`text[lc_legend_id="${legend.id}"]`);
				if (!alreadyExists) {
					// Append new legend elements, simple append for now.
					legendContainer.insertAdjacentHTML('beforeend', legend.definitionElement);
					legend.instanceElements.forEach((inst: string) => {
						legendContainer.insertAdjacentHTML('beforeend', inst);
					});
				}
			});
		} else { // Case 2: No Legend Box
			clipboardData.legendData.forEach((legend: any) => {
				// Annotate near path
				pasteContainer.insertAdjacentHTML('beforeend', legend.definitionElement);
				legend.instanceElements.forEach((inst: string) => {
					pasteContainer.insertAdjacentHTML('beforeend', inst);
				});
			});
		}

		// 5. Append to SVG and return full content
		this.svgRoot.appendChild(pasteContainer);
		svgxShowStatus('Logical data pasted!', 2000);
		return this.svgRoot.outerHTML;
	}

	// Helper: User to Logical conversion
	private _toLogical(v: number, d_min: number, d_max: number, v_min: number, v_max: number): number {
		return d_min + (v - v_max) * (d_max - d_min) / (v_min - v_max);
	}

	// Helper: Logical to User conversion
	private _fromLogical(d: number, d_min: number, d_max: number, v_min: number, v_max: number): number {
		return v_max + (d - d_min) * (v_min - v_max) / (d_max - d_min);
	}
}

// --- SVGX Logical Copy/Paste: END ---

// initial ready notification
console.log('SVGX: All functions initialized, sending ready message');
svgxSafePostMessage({ type: 'ready' });
