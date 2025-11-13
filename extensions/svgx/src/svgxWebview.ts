/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// svgxwebview.ts

declare const d3: any;

console.log('SVGX: webview script loading...');

// VS Code webview API
interface WebviewApi {
	postMessage(message: any): void;
	getState(): any;
	setState(state: any): void;
}

const typedWindow = window as Window & {
	svgxLogicalOps?: SvgxLogicalOperations;
	d3?: any;
};

declare const acquireVsCodeApi: () => WebviewApi;
const svgxVscode = acquireVsCodeApi();

function svgxSafePostMessage(msg: any): void {
	svgxVscode.postMessage(msg);
}

// SVGX visual editor
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
		// --- SVGX Logical Copy/Paste ---
		case 'getCopyDataRequest':
			if (typedWindow.svgxLogicalOps) {
				const copyData = typedWindow.svgxLogicalOps.getLogicalCopyData();
				svgxSafePostMessage({ type: 'copyDataResponse', payload: copyData });
			}
			break;
		case 'pasteDataRequest':
			if (typedWindow.svgxLogicalOps && message.payload) {
				const newSvgString = typedWindow.svgxLogicalOps.pasteLogicalData(message.payload);
				svgxSafePostMessage({ type: 'documentUpdate', payload: newSvgString });
			}
			break;
	}
});

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
	const root = document.getElementById('root');
	if (!root) { console.warn('svgx: missing root element'); return; }

	// FIX: Create a container for the SVG to enable zoom/pan on the parent.
	root.innerHTML = '';
	const container = document.createElement('div');
	container.id = 'svgx-svg-container';
	const displayContent = xmlText.trim().replace(/^\s*<\?xml[^?]*\?>/, '');
	container.innerHTML = displayContent;
	root.appendChild(container);
	console.log('svg doc is loaded into container');

	// FIX: Initialize D3.js with dynamic loading.
	svgxInitializeD3Enhancement();

	const svgElement = root.querySelector('svg');
	if (svgElement) {
		typedWindow.svgxLogicalOps = new SvgxLogicalOperations(svgElement);
	}
}

// FIX: New function to dynamically load D3.js, based on the previewWebview.ts pattern.
function svgxInitializeD3Enhancement(): void {
	console.log('SVGX D3.js initialization starting...');
	if (typeof typedWindow.d3 === 'undefined') {
		console.log('SVGX D3.js not found, attempting to load from CDN...');
		const script = document.createElement('script');
		script.src = 'https://d3js.org/d3.v7.min.js';
		script.onload = () => {
			console.log('SVGX D3.js loaded dynamically, version:', typedWindow.d3.version);
			svgxSetupD3Functionality();
		};
		script.onerror = (error) => {
			console.error('SVGX failed to load D3.js from CDN:', error);
			svgxShowStatus('Error: Failed to load D3.js library.');
		};
		document.head.appendChild(script);
	} else {
		console.log('SVGX D3.js already available, version:', typedWindow.d3.version);
		svgxSetupD3Functionality();
	}
}

// FIX: Rewritten to apply zoom/pan to the correct containers, based on previewWebview.ts.
function svgxSetupD3Functionality(): void {
	console.log('SVGX: svgxSetupD3Functionality function called');

	const rootContainer = d3.select('#root');
	const svgContainer = rootContainer.select('#svgx-svg-container');

	if (svgContainer.empty()) {
		console.warn('SVGX: SVG container not found for D3 zoom/pan');
		return;
	}

	const zoom = d3.zoom()
		.on('zoom', (event: any) => {
			svgContainer.style('transform',
				`translate(${event.transform.x}px, ${event.transform.y}px) scale(${event.transform.k})`);
		});

	rootContainer.call(zoom);

	console.log('SVGX D3.js zoom and pan enabled on container div');
	svgxShowStatus('SVGX Editor initialized with D3.js v' + d3.version);

	// svgxSetupClickHandlers();
}

// --- BUG FIX: The entire block below was the source of the conflict and has been removed to restore correct functionality. ---
/*
// FIX: Updated to use the new container and a single event listener.
function svgxSetupClickHandlers(): void {
	const container = document.getElementById('svgx-svg-container');
	if (!container) {
		console.warn('SVGX: SVG container not found for click handlers');
		return;
	}

	container.addEventListener('click', (event) => {
		event.stopPropagation();
		const target = event.target as Element;
		console.log('SVGX: Element clicked:', target.tagName);

		const svgElement = container.querySelector('svg');

		if (target && svgElement) {
			const elementInfo = svgxExtractElementInfo(target);
			if (elementInfo) {
				svgxSafePostMessage({
					type: 'edit',
					content: svgElement.outerHTML
				});
			}
		}
	});
}

function svgxExtractElementInfo(node: Element): { tagName: string; id?: string; className?: string; keyAttributes?: Record<string, string> } | null {
	if (!node) { return null; }

	const tagName = node.nodeName;
	const id = node.getAttribute('id') || undefined;
	const className = node.getAttribute('class') || undefined;
	const keyAttributes: Record<string, string> = {};
	if (!id && node.attributes) {
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
*/

function svgxFlashElement(elementSelector: string): void {
	if (typeof d3 === 'undefined') {
		console.log('SVGX: D3.js not available, cannot flash element');
		svgxShowStatus('D3.js flashing not available');
		return;
	}

	console.log('SVGX: Executing flash animation');
	let element = d3.select(elementSelector);
	if (element.empty() && elementSelector && !elementSelector.startsWith('#')) {
		element = d3.select('#' + elementSelector);
	}
	if (element.empty()) {
		const domElement = document.querySelector(elementSelector) ||
			document.getElementById(elementSelector) ||
			document.querySelector(`[id="${elementSelector}"]`);
		if (domElement) {
			element = d3.select(domElement);
		}
	}
	if (element.empty()) {
		console.warn('SVGX element not found for flashing:', elementSelector);
		svgxShowStatus('Element not found: ' + elementSelector);
		return;
	}

	console.log('SVGX flashing element:', elementSelector);
	svgxShowStatus('Flashing element with D3.js: ' + elementSelector);

	const originalStroke = element.style('stroke');
	const originalStrokeWidth = element.style('stroke-width');
	const originalFillOpacity = element.style('fill-opacity');

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

// --- SVGX Logical Copy/Paste ---


class SvgxLogicalMapping {

	public has_x_startDate: boolean = true;
	public x_startDate: Date = new Date('9/12/2025');
	public x_scale_days: number = 365;

	constructor() { }

	//#region Logical Mapping Methods

	public toLogicalX(vx: number, dx_min: number, dx_max: number, vx_min: number, vx_max: number): number {
		if (vx_max === vx_min) {
			return dx_min;
		}
		return dx_min + (vx - vx_min) * (dx_max - dx_min) / (vx_max - vx_min);
	}

	public toLogicalY(vy: number, dy_min: number, dy_max: number, vy_min: number, vy_max: number): number {
		if (vy_min === vy_max) {
			return dy_min;
		}
		return dy_min + (vy - vy_max) * (dy_max - dy_min) / (vy_min - vy_max);
	}

	public fromLogicalX(dx: number, dx_min: number, dx_max: number, vx_min: number, vx_max: number): number {
		if (dx_max === dx_min) {
			return vx_min;
		}
		return vx_min + (dx - dx_min) * (vx_max - vx_min) / (dx_max - dx_min);
	}

	public fromLogicalY(dy: number, dy_min: number, dy_max: number, vy_min: number, vy_max: number): number {
		if (dy_max === dy_min) {
			return vy_max;
		}
		return vy_max + (dy - dy_min) * (vy_min - vy_max) / (dy_max - dy_min);
	}

	//#endregion

	//#region X Axis Date to Ticks Conversion

	private _convert_date_to_ticks(r_posixct_date: Date): number {
		const EPOCH_DIFF_DAYS = 719163;
		const EPOCH_DIFF_SECONDS = EPOCH_DIFF_DAYS * 86400;
		const TICKS_PER_SECOND = 10000000;
		const seconds_from_unix_epoch = Math.round(r_posixct_date.getTime() / 1000);
		const total_seconds = seconds_from_unix_epoch + EPOCH_DIFF_SECONDS;
		return total_seconds * TICKS_PER_SECOND;
	}

	public toLogicalTickX(dx: number): number {
		const dayOffset = dx * this.x_scale_days;
		const milliseconds_offset = dayOffset * 24 * 60 * 60 * 1000;
		const targetDate = new Date(this.x_startDate.getTime() + milliseconds_offset);
		return this._convert_date_to_ticks(targetDate);
	}

	//#endregion
}

class SvgxLogicalOperations {
	private svgRoot: SVGSVGElement;
	private svgxLogicalMapping: SvgxLogicalMapping;
	private currentlySelectedElement: SVGPathElement | null = null;

	constructor(svgElement: SVGSVGElement) {
		this.svgRoot = svgElement;
		this.svgxLogicalMapping = new SvgxLogicalMapping();
		this.initializeSelectionHandling();
	}

	public initializeSelectionHandling(): void {
		const paths = this.svgRoot.querySelectorAll('path');
		paths.forEach(path => {
			path.addEventListener('click', (event) => {
				event.stopPropagation();
				if (this.currentlySelectedElement) {
					this.currentlySelectedElement.classList.remove('selected');
				}
				this.currentlySelectedElement = path;
				this.currentlySelectedElement.classList.add('selected');
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

	public getLogicalCopyData(): object | null {
		if (!this.currentlySelectedElement) {
			svgxShowStatus('No path selected to copy.', 2000);
			return null;
		}

		const element = this.currentlySelectedElement;

		const ctm = (element as SVGGraphicsElement).getCTM();
		if (!ctm) {
			console.error('SVGX Error: Could not get CTM for selected element.');
			return null;
		}

		const mappingElement = element.closest('[xlm][ylm]') || this.svgRoot;
		const xlmAttr = mappingElement.getAttribute('xlm');
		const ylmAttr = mappingElement.getAttribute('ylm');
		if (!xlmAttr || !ylmAttr) {
			console.error('SVGX Error: No xlm/ylm mapping found on element or ancestors.');
			return null;
		}

		const xlm = JSON.parse(xlmAttr);
		const ylm = JSON.parse(ylmAttr);

		const d = element.getAttribute('d') || '';
		const logicalPoints: { x: number, y: number }[] = [];
		const commands = d.match(/[a-zA-Z][^a-zA-Z]*/g) || [];
		commands.forEach(cmdStr => {
			const command = cmdStr[0];
			const points = (cmdStr.slice(1).match(/-?\d+(\.\d+)?/g) || []).map(parseFloat);
			if ((command === 'M' || command === 'L') && points.length === 2) {
				const pt = this.svgRoot.createSVGPoint();
				pt.x = points[0];
				pt.y = points[1];

				const transformedPt = pt.matrixTransform(ctm);

				const logicalX = this._toLogicalX(transformedPt.x, xlm[0], xlm[1], xlm[2], xlm[3]);
				const logicalY = this._toLogicalY(transformedPt.y, ylm[0], ylm[1], ylm[2], ylm[3]);
				logicalPoints.push({ x: logicalX, y: logicalY });
			}
		});

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

		const attributes: { [key: string]: string } = {};
		for (let i = 0; i < element.attributes.length; i++) {
			const attr = element.attributes[i];
			if (attr.name !== 'd' && attr.name !== 'class') {
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

	public pasteLogicalData(clipboardData: any): string | null {
		const mappingElement = this.svgRoot;
		const xlmAttr = mappingElement.getAttribute('xlm');
		const ylmAttr = mappingElement.getAttribute('ylm');
		if (!xlmAttr || !ylmAttr) {
			console.error('SVGX Error: No xlm/ylm mapping found on target SVG.');
			return null;
		}

		const targetXlm = JSON.parse(xlmAttr);
		const targetYlm = JSON.parse(ylmAttr);

		const logicalPoints = clipboardData.element.logicalPoints;
		const d = logicalPoints.map((pt: any, i: number) => {
			const userX = this._fromLogicalX(pt.x, targetXlm[0], targetXlm[1], targetXlm[2], targetXlm[3]);
			const userY = this._fromLogicalY(pt.y, targetYlm[0], targetYlm[1], targetYlm[2], targetYlm[3]);
			return (i === 0 ? 'M' : 'L') + `${userX} ${userY}`;
		}).join(' ');

		const pasteContainer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
		pasteContainer.setAttribute('class', 'pasted-element');

		const newPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		newPath.setAttribute('d', d);
		Object.keys(clipboardData.element.attributes).forEach(key => {
			newPath.setAttribute(key, clipboardData.element.attributes[key]);
		});

		pasteContainer.appendChild(newPath);

		const legendContainer = this.svgRoot.querySelector('g[id*="legend"]');
		if (legendContainer) {
			clipboardData.legendData.forEach((legend: any) => {
				const alreadyExists = legendContainer.querySelector(`text[lc_legend_id="${legend.id}"]`);
				if (!alreadyExists) {
					legendContainer.insertAdjacentHTML('beforeend', legend.definitionElement);
					legend.instanceElements.forEach((inst: string) => {
						legendContainer.insertAdjacentHTML('beforeend', inst);
					});
				}
			});
		} else {
			clipboardData.legendData.forEach((legend: any) => {
				pasteContainer.insertAdjacentHTML('beforeend', legend.definitionElement);
				legend.instanceElements.forEach((inst: string) => {
					pasteContainer.insertAdjacentHTML('beforeend', inst);
				});
			});
		}

		this.svgRoot.appendChild(pasteContainer);
		svgxShowStatus('Logical data pasted!', 2000);
		return this.svgRoot.outerHTML;
	}

	private _toLogicalX(v: number, d_min: number, d_max: number, v_min: number, v_max: number): number {
		let dx = this.svgxLogicalMapping.toLogicalX(v, d_min, d_max, v_min, v_max);
		if (this.svgxLogicalMapping.has_x_startDate) {
			dx = this.svgxLogicalMapping.toLogicalTickX(dx);
		}
		return dx;
	}

	private _toLogicalY(v: number, d_min: number, d_max: number, v_min: number, v_max: number): number {
		return this.svgxLogicalMapping.toLogicalY(v, d_min, d_max, v_min, v_max);
	}

	private _fromLogicalX(d: number, d_min: number, d_max: number, v_min: number, v_max: number): number {
		return this.svgxLogicalMapping.fromLogicalX(d, d_min, d_max, v_min, v_max);
	}

	private _fromLogicalY(d: number, d_min: number, d_max: number, v_min: number, v_max: number): number {
		return this.svgxLogicalMapping.fromLogicalY(d, d_min, d_max, v_min, v_max);
	}

}

// initial ready notification
console.log('SVGX: All functions initialized, sending ready message');
svgxSafePostMessage({ type: 'ready' });

export { };
