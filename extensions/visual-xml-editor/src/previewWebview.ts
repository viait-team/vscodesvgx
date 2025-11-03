/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare const d3: any;

// VS Code webview API
interface WebviewApi {
	postMessage(message: any): void;
	getState(): any;
	setState(state: any): void;
}

declare const previewAcquireVsCodeApi: () => WebviewApi;
const previewVscode = previewAcquireVsCodeApi();

function previewSafePostMessage(msg: any): void {
	previewVscode.postMessage(msg);
}

// Simple two-panel visual XML editor (left: tree, right: attributes)
window.addEventListener('message', (event: MessageEvent) => {
	const message = event.data;
	switch (message.type) {
		case 'init':
			console.debug('preview: init received. experimentalTwoPanel=', !!message.experimentalTwoPanel);
			previewRenderRoot(message.content, true);
			try {
				if (message.theme === 'dark') { document.documentElement.classList.add('vxe-theme-dark'); }
				else { document.documentElement.classList.remove('vxe-theme-dark'); }
			} catch { }
			break;
		case 'theme':
			try {
				if (message.theme === 'dark') { document.documentElement.classList.add('vxe-theme-dark'); }
				else { document.documentElement.classList.remove('vxe-theme-dark'); }
			} catch { }
			break;
		case 'flashElement':
			// NEW: Handle D3.js flashing animation requests
			previewFlashElement(message.elementId || message.selector);
			break;
		case 'highlightElement':
			// NEW: Handle highlight requests from extension for preview sync
			console.log(`EP: [7/8] Preview: Received highlight message`);
			if (message.data && message.data.elementInfo) {
				const selector = buildElementSelector(message.data.elementInfo);
				console.log('Preview calling flashElement with selector:', selector);
				previewFlashElement(selector);
			} else {
				console.warn('preview highlightElement message missing data or elementInfo');
			}
			break;
	}
});

let previewCurrentDoc: Document | null = null;
let previewSelectedNode: Element | null = null;

function buildElementSelector(elementInfo: { tagName: string; id?: string; className?: string; keyAttributes?: Record<string, string> }): string {
	const selectors: string[] = [];
	const baseSelector = elementInfo.tagName.toLowerCase();

	// Strategy 1: ID-based (most reliable)
	if (elementInfo.id) {
		return `#${CSS.escape(elementInfo.id)}`;
	}

	// Strategy 2: Key attributes for elements without ID
	if (elementInfo.keyAttributes && Object.keys(elementInfo.keyAttributes).length > 0) {
		let attributeSelector = baseSelector;
		for (const [attr, value] of Object.entries(elementInfo.keyAttributes)) {
			// For path elements with d attribute, use exact match
			if (attr === 'd' && value) {
				attributeSelector += `[d="${value}"]`;
			} else {
				attributeSelector += `[${attr}="${CSS.escape(value)}"]`;
			}
		}
		selectors.push(attributeSelector);
	}

	// Strategy 3: Class-based
	if (elementInfo.className) {
		const classes = elementInfo.className.trim().split(/\s+/)
			.filter(cls => cls.length > 0)
			.map(cls => CSS.escape(cls));

		if (classes.length > 0) {
			selectors.push(`${baseSelector}.${classes.join('.')}`);
		}
	}

	// Strategy 4: Tag name only (fallback)
	selectors.push(baseSelector);

	return selectors.join(', ');
}

function previewShowStatus(msg: string, timeout: number = 2500): void {
	try {
		let s = document.getElementById('preview-vxe-status');
		if (!s) {
			s = document.createElement('div');
			s.id = 'preview-vxe-status';
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

function previewRenderRoot(xmlText: string, _twoPanel: boolean): void {
	const parser = new DOMParser();
	const doc = parser.parseFromString(xmlText, 'application/xml');
	previewCurrentDoc = doc;
	const root = document.getElementById('root');
	if (!root) { console.warn('preview: missing root element'); return; }
	root.innerHTML = '';

	// Simple container for SVG content display
	const container = document.createElement('div');
	container.id = 'preview-svg-container';
	container.innerHTML = xmlText;
	root.appendChild(container);

	// Initialize D3.js for flashing animations and zoom/pan
	previewInitializeD3Enhancement();

	// Setup click handlers for preview-to-editor sync
	previewSetupClickHandlers();
}

// ============================================================================
// NEW: D3.js Enhancement Functions for Preview
// ============================================================================

function previewInitializeD3Enhancement(): void {
	console.log('Preview D3.js initialization starting...');
	// Dynamically load d3.js if not already loaded
	if (typeof (window as any).d3 === 'undefined') {
		console.log('Preview D3.js not found, attempting to load from CDN...');
		const script = document.createElement('script');
		script.src = 'https://d3js.org/d3.v7.min.js';
		script.onload = () => {
			console.log('Preview D3.js loaded dynamically, version:', (window as any).d3.version);
			previewSetupD3Functionality();
		};
		script.onerror = (error) => {
			console.error('Preview failed to load D3.js from CDN:', error);
			console.warn('Preview failed to load D3.js from CDN, flashing features disabled');
		};
		document.head.appendChild(script);
		console.log('Preview D3.js script element added to head');
	} else {
		console.log('Preview D3.js already available, version:', (window as any).d3.version);
		previewSetupD3Functionality();
	}
}

function previewSetupD3Functionality(): void {
	console.log('Preview: previewSetupD3Functionality function called');

	// Setup zoom/pan functionality
	const rootContainer = d3.select('#root');
	const svgContainer = rootContainer.select('#preview-svg-container');

	if (svgContainer.empty()) {
		console.warn('Preview: SVG container not found for zoom/pan');
		return;
	}

	// Apply zoom/pan to the root div container, not the SVG itself
	const zoom = d3.zoom()
		.on('zoom', (event: any) => {
			// Apply transform to the SVG container via CSS transform
			svgContainer.style('transform',
				`translate(${event.transform.x}px, ${event.transform.y}px) scale(${event.transform.k})`);
		});

	// Attach zoom behavior to the root container
	rootContainer.call(zoom);

	console.log('Preview: D3.js zoom and pan enabled on container div');
	console.log('Preview D3.js functionality ready for flashing animations and zoom/pan');
}

function previewSetupClickHandlers(): void {
	const container = document.getElementById('preview-svg-container');
	if (!container) {
		console.warn('Preview: SVG container not found for click handlers');
		return;
	}

	container.addEventListener('click', (event) => {
		const target = event.target as Element;
		console.log('PE: [1/8] Preview: Element clicked:', target.tagName);

		if (target) {
			console.log('Preview: Extracting element info');
			// Use the same extractElementInfo function as editor
			const elementInfo = extractElementInfo(target);
			if (elementInfo) {
				console.log('PE: [2/8] Preview: Sending syncToEditor message to extension host');
				previewSafePostMessage({
					type: 'syncToEditor',
					data: elementInfo
				});
			}
		}
	});
}

function extractElementInfo(node: Element): { tagName: string; id?: string; className?: string; keyAttributes?: Record<string, string> } | null {
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
				addAttribute(node, 'cx', keyAttributes);
				addAttribute(node, 'cy', keyAttributes);
				addAttribute(node, 'r', keyAttributes);
				break;
			case 'rect':
				addAttribute(node, 'x', keyAttributes);
				addAttribute(node, 'y', keyAttributes);
				addAttribute(node, 'width', keyAttributes);
				addAttribute(node, 'height', keyAttributes);
				break;
			case 'path':
				addAttribute(node, 'd', keyAttributes);
				break;
			case 'polygon':
				addAttribute(node, 'points', keyAttributes);
				break;
		}
	}

	return { tagName, id, className, keyAttributes };
}

function addAttribute(node: Element, attrName: string, keyAttributes: Record<string, string>): void {
	const value = node.getAttribute(attrName);
	if (value) {
		keyAttributes[attrName] = value;
	}
}

function previewFlashElement(elementSelector: string): void {
	const d3 = (window as any).d3;
	if (typeof d3 === 'undefined') {
		console.log(`EP: [8/8] Preview: D3.js not available, cannot flash element`);
		previewShowStatus('D3.js flashing not available');
		return;
	}

	console.log(`EP: [8/8] Preview: Executing flash animation`);
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
		console.warn('Preview element not found for flashing:', elementSelector);
		previewShowStatus('Element not found: ' + elementSelector);
		return;
	}

	console.log('Preview flashing element:', elementSelector);
	previewShowStatus('Flashing element with D3.js: ' + elementSelector);

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

function previewFlashElementByNode(xmlNode: Element): void {
	if (!xmlNode) { return; }

	// Try to find a corresponding visual element by ID attribute
	const id = xmlNode.getAttribute && xmlNode.getAttribute('id');
	if (id) {
		previewFlashElement('#' + id);
		return;
	}

	// For elements without ID, try to find by tag name (basic)
	const tagName = xmlNode.nodeName;
	if (tagName) {
		previewFlashElement(tagName);
		previewShowStatus('Flashed first ' + tagName + ' element (no ID found)');
		return;
	}

	previewShowStatus('Cannot flash element - no suitable selector found');
}

// initial ready notification
previewSafePostMessage({ type: 'ready' });


