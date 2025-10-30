/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// VS Code webview API
interface WebviewApi {
	postMessage(message: any): void;
	getState(): any;
	setState(state: any): void;
}

declare const previewAcquireVsCodeApi: () => WebviewApi;
const previewVscode = previewAcquireVsCodeApi();

// Guard to avoid posting messages or running timers during unload/shutdown
let previewIsClosing = false;
function previewSafePostMessage(msg: any): void {
	if (previewIsClosing) { return; }
	try {
		// Post asynchronously to avoid illegal access when the host is tearing down.
		setTimeout(() => {
			if (previewIsClosing) { return; }
			try {
				if (typeof previewVscode === 'object' && typeof previewVscode.postMessage === 'function') {
					previewVscode.postMessage(msg);
				}
			} catch (e) {
				try { console.warn('postMessage failed (ignored):', e); } catch { }
			}
		}, 0);
	} catch (e) {
		try { console.warn('previewSafePostMessage scheduling failed', e); } catch { }
	}
}

window.addEventListener('beforeunload', () => { previewIsClosing = true; });
window.addEventListener('unload', () => { previewIsClosing = true; });
window.addEventListener('pagehide', () => { previewIsClosing = true; });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { previewIsClosing = true; } });

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
			console.log('preview highlightElement message received:', message);
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
			attributeSelector += `[${attr}="${CSS.escape(value)}"]`;
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
		setTimeout(() => { try { s!.style.display = 'none'; } catch { } }, timeout);
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

	// Initialize D3.js for flashing animations
	previewInitializeD3Enhancement();
}

// ============================================================================
// NEW: D3.js Enhancement Functions for Preview
// ============================================================================

function previewInitializeD3Enhancement(): void {
	// Dynamically load d3.js if not already loaded
	if (typeof (window as any).d3 === 'undefined') {
		const script = document.createElement('script');
		script.src = 'https://d3js.org/d3.v7.min.js';
		script.onload = () => {
			console.log('Preview D3.js loaded dynamically, version:', (window as any).d3.version);
			previewSetupD3Functionality();
		};
		script.onerror = () => {
			console.warn('Preview failed to load D3.js from CDN, flashing features disabled');
		};
		document.head.appendChild(script);
	} else {
		console.log('Preview D3.js already available, version:', (window as any).d3.version);
		previewSetupD3Functionality();
	}
}

function previewSetupD3Functionality(): void {
	// No need to add event listeners here since we use the XML tree interface
	// D3 will be used for flashing animations triggered from the tree context menu
	console.log('Preview D3.js functionality ready for flashing animations');
}

function previewFlashElement(elementSelector: string): void {
	const d3 = (window as any).d3;
	if (typeof d3 === 'undefined') {
		console.warn('Preview D3.js not available, cannot flash element');
		previewShowStatus('D3.js flashing not available');
		return;
	}

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


