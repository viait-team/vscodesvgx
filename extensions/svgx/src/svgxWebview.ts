/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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

// Guard to avoid posting messages or running timers during unload/shutdown
let svgxIsClosing = false;
function svgxSafePostMessage(msg: any): void {
	if (svgxIsClosing) { return; }
	try {
		// Post asynchronously to avoid illegal access when the host is tearing down.
		setTimeout(() => {
			if (svgxIsClosing) { return; }
			try {
				if (typeof svgxVscode === 'object' && typeof svgxVscode.postMessage === 'function') {
					svgxVscode.postMessage(msg);
				}
			} catch (e) {
				try { console.warn('postMessage failed (ignored):', e); } catch { }
			}
		}, 0);
	} catch (e) {
		try { console.warn('svgxSafePostMessage scheduling failed', e); } catch { }
	}
}

window.addEventListener('beforeunload', () => { svgxIsClosing = true; });
window.addEventListener('unload', () => { svgxIsClosing = true; });
window.addEventListener('pagehide', () => { svgxIsClosing = true; });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { svgxIsClosing = true; } });

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
		setTimeout(() => { try { s!.style.display = 'none'; } catch { } }, timeout);
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
	const svgContainer = d3.select('#root');
	const svg = svgContainer.select('svg');

	if (svg.empty()) {
		console.warn('SVGX SVG element not found for D3 zoom/pan');
		return;
	}

	// Wrap SVG content in a <g> tag for zooming
	const g = svg.append('g');
	const nodes = Array.from(svg.node()!.childNodes);
	nodes.forEach((node) => {
		if (node !== g.node()) {
			g.node()!.appendChild(node);
		}
	});

	const zoom = d3.zoom()
		.on('zoom', (event: any) => {
			g.attr('transform', event.transform);
		});

	svg.call(zoom);

	console.log('SVGX D3.js zoom and pan enabled');
	svgxShowStatus('SVGX Editor initialized with D3.js v' + d3.version);

	// Re-run click handler setup on the new <g> element
	svgxSetupClickHandlers(g);
}

function svgxSetupClickHandlers(selection: any): void {
	if (!selection || selection.empty()) {
		console.warn('SVGX: Invalid selection for click handlers');
		return;
	}

	selection.selectAll('*').on('click', (event: MouseEvent) => {
		event.stopPropagation(); // Prevent zoom from interfering with clicks
		const target = event.target as Element;
		console.log('SVGX: Element clicked:', target.tagName);

		if (target) {
			const elementInfo = svgxExtractElementInfo(target);
			if (elementInfo) {
				svgxSafePostMessage({
					type: 'edit',
					content: selection.node().outerHTML
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

function svgxFlashElement(elementSelector: string): void {
	const d3 = (window as any).d3;
	if (typeof d3 === 'undefined') {
		console.log('SVGX: D3.js not available, cannot flash element');
		svgxShowStatus('D3.js flashing not available');
		return;
	}

	console.log('SVGX: Executing flash animation');
	// Try to find element by various selectors
	let element = d3.select(elementSelector);

	// If not found by selector, try as ID
	if (element.empty() && elementSelector && !elementSelector.startsWith('#')) {
		element = d3.select('#' + elementSelector);
	}

	// If still not found, try finding in the document
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

// initial ready notification
console.log('SVGX: All functions initialized, sending ready message');
svgxSafePostMessage({ type: 'ready' });
