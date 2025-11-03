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

declare const acquireVsCodeApi: () => WebviewApi;
const vscode = acquireVsCodeApi();

function safePostMessage(msg: any): void {
	vscode.postMessage(msg);
}

// Send ready message when the webview loads to request initial content
document.addEventListener('DOMContentLoaded', () => {
	// Add VS Code completion widget styles
	const completionStyles = document.createElement('style');
	completionStyles.textContent = `
		.vscode-completion-widget {
			font-family: var(--vscode-editor-font-family, 'Consolas', 'Courier New', monospace) !important;
			font-size: var(--vscode-editor-font-size, 14px) !important;
			line-height: 1.4 !important;
		}

		.completion-item {
			transition: background-color 0.1s ease-in-out !important;
		}

		.completion-item:hover {
			background-color: var(--vscode-editorSuggestWidget-selectedBackground, #094771) !important;
			color: var(--vscode-editorSuggestWidget-selectedForeground, #ffffff) !important;
		}

		.attribute-value-input {
			font-family: var(--vscode-editor-font-family, 'Consolas', 'Courier New', monospace) !important;
			font-size: var(--vscode-editor-font-size, 14px) !important;
			background: var(--vscode-input-background, #3c3c3c) !important;
			color: var(--vscode-input-foreground, #cccccc) !important;
			border: 1px solid var(--vscode-input-border, #454545) !important;
			padding: 2px 4px !important;
			border-radius: 2px !important;
		}

		.attribute-value-input:focus {
			outline: 1px solid var(--vscode-focusBorder, #0078d4) !important;
			outline-offset: -1px !important;
		}

		.save-button {
			background: var(--vscode-button-background, #0e639c) !important;
			color: var(--vscode-button-foreground, #ffffff) !important;
			border: none !important;
			padding: 4px 8px !important;
			border-radius: 3px !important;
			font-size: 12px !important;
			cursor: pointer !important;
			margin-left: 8px !important;
		}

		.save-button:hover {
			background: var(--vscode-button-hoverBackground, #1177bb) !important;
		}

		.save-status {
			font-size: 11px !important;
			color: var(--vscode-descriptionForeground, #cccccc99) !important;
			margin-left: 8px !important;
		}
	`;
	document.head.appendChild(completionStyles);

	// Add keyboard shortcuts
	document.addEventListener('keydown', (e) => {
		// Ctrl+S to save
		if (e.ctrlKey && e.key === 's') {
			e.preventDefault();
			requestSave();
		}
	});

	safePostMessage({ type: 'ready' });
});

window.addEventListener('message', (event: MessageEvent) => {
	const message = event.data;
	switch (message.type) {
		case 'init':
			console.debug('vxe: init received. experimentalTwoPanel=', !!message.experimentalTwoPanel);
			renderRoot(message.content, true);
			try {
				if (message.theme === 'dark') { document.documentElement.classList.add('vxe-theme-dark'); }
				else { document.documentElement.classList.remove('vxe-theme-dark'); }
			} catch { }
			break;
		case 'saveAck':
			// Handle save acknowledgment from extension
			if (message.status === 'ok') {
				showSaveStatus('Saved');
			} else {
				showSaveStatus('Save failed: ' + (message.details || 'Unknown error'));
			}
			break;
		case 'requestFullDocument':
			// Extension is requesting the full document for save
			try {
				const serializer = new XMLSerializer();
				const xml = serializer.serializeToString(currentDoc || document);
				safePostMessage({ type: 'fullDocument', xml: xml });
			} catch (e) {
				console.error('Failed to send full document', e);
				showSaveStatus('Save failed');
			}
			break;
		case 'theme':
			try {
				if (message.theme === 'dark') { document.documentElement.classList.add('vxe-theme-dark'); }
				else { document.documentElement.classList.remove('vxe-theme-dark'); }
			} catch { }
			break;
		case 'flashElement':
			// NOTE: Editor webview doesn't handle flashing - forward to preview if needed
			console.log('Editor webview received flashElement message, ignoring');
			break;
		case 'highlightElement':
			// NOTE: Editor webview doesn't handle highlight - forward to preview if needed
			console.log('Editor webview received highlightElement message, ignoring');
			break;
		case 'selectInTree':
			console.log('PE: [5/8] Editor Webview: Received selectInTree message');
			selectElementInTree(message.data);
			break;
	}
});

function selectElementInTree(elementInfo: any) {
	console.log('PE: [6/8] Editor Webview: Finding element in tree');
	if (!currentDoc) {
		console.warn('selectElementInTree: currentDoc is null');
		return;
	}

	let element: Element | null = null;

	if (elementInfo.id) {
		// Direct comparison for ID
		const allElements = currentDoc.getElementsByTagName('*');
		for (let i = 0; i < allElements.length; i++) {
			if (allElements[i].getAttribute('id') === elementInfo.id) {
				element = allElements[i];
				break;
			}
		}
	} else if (elementInfo.keyAttributes) {
		// Direct comparison for other key attributes
		const allElements = currentDoc.getElementsByTagName(elementInfo.tagName);
		for (let i = 0; i < allElements.length; i++) {
			const currentElement = allElements[i];
			let allMatch = true;
			for (const [attr, value] of Object.entries(elementInfo.keyAttributes)) {
				if (currentElement.getAttribute(attr) !== value) {
					allMatch = false;
					break;
				}
			}
			if (allMatch) {
				element = currentElement;
				break;
			}
		}
	} else if (elementInfo.className) {
		// querySelector for class name
		const selector = `${elementInfo.tagName.toLowerCase()}.${elementInfo.className.trim().split(/\s+/).join('.')}`;
		element = currentDoc.querySelector(selector);
	}


	if (element) {
		console.log('PE: [7/8] Editor Webview: Element found, selecting node');
		selectNode(element);
		console.log('PE: [8/8] Editor Webview: Node selected');
	} else {
		console.warn('selectElementInTree: Element not found for:', elementInfo);
	}
}

let currentDoc: Document | null = null;
let selectedNode: Element | null = null;

function showStatus(msg: string, timeout: number = 2500): void {
	try {
		let s = document.getElementById('vxe-status');
		if (!s) {
			s = document.createElement('div');
			s.id = 'vxe-status';
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

function renderRoot(xmlText: string, _twoPanel: boolean): void {
	const parser = new DOMParser();
	const doc = parser.parseFromString(xmlText, 'application/xml');
	currentDoc = doc;
	const root = document.getElementById('root');
	if (!root) { console.warn('vxe: missing root element'); return; }
	root.innerHTML = '';

	// container
	const container = document.createElement('div');
	container.id = 'vxe-two-panel';

	// left: tree
	const treeContainer = document.createElement('div');
	treeContainer.id = 'tree-container';
	const treeRoot = document.createElement('div');
	treeRoot.className = 'tree-root';

	// toolbar moved into the left pane (tree)
	const toolbar = document.createElement('div');
	toolbar.id = 'vxe-toolbar';
	const btn = (label: string, title: string, handler: () => void) => {
		const b = document.createElement('button');
		b.className = 'vxe-toolbtn';
		b.title = title || label;
		b.innerHTML = label;
		b.addEventListener('click', handler);
		return b;
	};
	toolbar.appendChild(btn('⟳', 'Refresh (re-read file)', () => { safePostMessage({ type: 'ready' }); showStatus('Requested refresh'); }));
	toolbar.appendChild(btn('&#x2B9B;', 'Expand all', () => { expandAll(); }));
	toolbar.appendChild(btn('&#x2B9A;', 'Collapse all', () => { collapseAll(); }));

	if (doc.documentElement) {
		const tree = createTreeNode(doc.documentElement);
		treeRoot.appendChild(tree);
	}

	// insert toolbar at the top of the tree root
	treeRoot.insertBefore(toolbar, treeRoot.firstChild);

	treeContainer.appendChild(treeRoot);

	// right: attributes
	const attrsContainer = document.createElement('div');
	attrsContainer.id = 'attributes-container';

	// add resizer element between left and right panes
	const resizer = document.createElement('div');
	resizer.id = 'vxe-resizer';

	container.appendChild(treeContainer);
	container.appendChild(resizer);
	container.appendChild(attrsContainer);
	root.appendChild(container);

	// default select
	if (doc.documentElement) { selectNode(doc.documentElement); }

	// resizer drag logic
	setupResizer(resizer, treeContainer, container);

	// NOTE: D3.js functionality moved to preview webview
	// initializeD3Enhancement(); // removed - preview webview handles this
}

function setupResizer(resizer: HTMLElement, treeContainer: HTMLElement, container: HTMLElement): void {
	let dragging = false;
	let startX = 0;
	let startWidth = 0;
	resizer.addEventListener('mousedown', (e) => {
		e.preventDefault();
		dragging = true;
		startX = e.clientX;
		startWidth = treeContainer.getBoundingClientRect().width;
		document.addEventListener('mousemove', onMove);
		document.addEventListener('mouseup', onUp);
	});

	function onMove(e: MouseEvent) {
		if (!dragging) { return; }
		const dx = e.clientX - startX;
		let newWidth = startWidth + dx;
		const containerRect = container.getBoundingClientRect();
		const min = 120;
		const max = containerRect.width - 200;
		if (newWidth < min) { newWidth = min; }
		if (newWidth > max) { newWidth = max; }
		treeContainer.style.flex = '0 0 ' + newWidth + 'px';
	}

	function onUp() {
		dragging = false;
		document.removeEventListener('mousemove', onMove);
		document.removeEventListener('mouseup', onUp);
	}
}

function createTreeNode(node: Element): HTMLElement {
	const container = document.createElement('div');
	container.className = 'tree-node';
	(container as any).__vxe_node = node;

	// header
	const header = document.createElement('div');
	header.className = 'tree-header';

	const exp = document.createElement('button');
	exp.className = 'expander';

	function rightChevron() {
		return '<svg width="10" height="10" viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M3 2 L7 5 L3 8" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
	}
	function downChevron() {
		return '<svg width="10" height="10" viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M2 3 L5 7 L8 3" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
	}

	const hasChildren = node.childNodes && Array.from(node.childNodes).some(n => n.nodeType === Node.ELEMENT_NODE);
	if (hasChildren) {
		exp.innerHTML = rightChevron();
		container.dataset.expanded = 'false';
		exp.setAttribute('aria-expanded', 'false');
		exp.setAttribute('aria-label', 'Expand');
	} else {
		exp.innerHTML = '';
		container.dataset.expanded = 'false';
		exp.setAttribute('aria-hidden', 'true');
	}
	header.appendChild(exp);

	const name = document.createElement('span');
	name.className = 'tree-name';
	name.textContent = node.nodeName;
	header.appendChild(name);

	header.addEventListener('click', () => { selectNode(node, container); });

	container.appendChild(header);

	const body = document.createElement('div');
	body.className = 'tree-children';
	Array.from(node.childNodes).forEach(child => {
		if (child.nodeType === Node.ELEMENT_NODE) {
			body.appendChild(createTreeNode(child as Element));
		}
	});
	container.appendChild(body);

	// expander
	exp.addEventListener('click', (ev) => {
		ev.stopPropagation();
		if (body.style.display === 'none' || container.dataset.expanded === 'false') {
			body.style.display = '';
			exp.innerHTML = downChevron();
			container.dataset.expanded = 'true';
			exp.setAttribute('aria-expanded', 'true');
			exp.setAttribute('aria-label', 'Collapse');
		} else {
			body.style.display = 'none';
			exp.innerHTML = rightChevron();
			container.dataset.expanded = 'false';
			exp.setAttribute('aria-expanded', 'false');
			exp.setAttribute('aria-label', 'Expand');
		}
	});

	// keyboard accessibility: toggle on Enter or Space
	exp.addEventListener('keydown', (ev) => {
		if (ev.key === 'Enter' || ev.key === ' ') {
			ev.preventDefault();
			ev.stopPropagation();
			exp.click();
		}
	});

	// context menu on right click: dynamic items based on node
	container.addEventListener('contextmenu', (ev) => {
		ev.preventDefault();
		const items: Array<{ label: string; action: () => void }> = [];
		items.push({ label: 'Copy XPath', action: () => { try { const path = computeXPath(node); safePostMessage({ type: 'debug', msg: 'xpath:' + path }); showStatus('Copied XPath to output'); } catch { } } });
		items.push({ label: 'Add attribute', action: () => { promptAddAttribute(node); } });
		items.push({ label: 'Add child', action: () => { promptAddChild(node); } });
		if (node.attributes && node.attributes.length) { items.push({ label: 'Edit attributes', action: () => { selectNode(node); } }); }
		// only allow delete if not root
		if (node.parentNode) { items.push({ label: 'Delete', action: () => { deleteNode(node); } }); }
		// NOTE: D3.js flash functionality moved to preview webview
		showContextMenu(ev.clientX, ev.clientY, items);
	});

	return container;
}

function selectNode(node: Element, _containerEl?: HTMLElement): void {
	selectedNode = node;
	// clear previous selection
	document.querySelectorAll('.tree-header.selected').forEach(h => h.classList.remove('selected'));
	try {
		// highlight header for the node
		const headers = Array.from(document.querySelectorAll('.tree-node')).filter(n => (n as any).__vxe_node === node).map(n => n.querySelector('.tree-header'));
		headers.forEach(h => {
			if (h) {
				h.classList.add('selected');
				// Scroll the selected element into view
				h.scrollIntoView({
					behavior: 'smooth',
					block: 'center',
					inline: 'nearest'
				});
			}
		});
	} catch { }
	renderAttributes(node);

	// NEW: Send message to sync with preview automatically
	try {
		const elementInfo = extractElementInfo(node);
		if (elementInfo) {
			console.log(`EP: [1/8] Editor: User clicked element ${elementInfo.id || elementInfo.tagName}`);
			console.log(`EP: [2/8] Editor: Sending highlight message to extension host`);
			safePostMessage({
				type: 'syncToPreview',
				data: elementInfo
			});
		}
	} catch (e) {
		console.warn('Failed to sync node selection to preview:', e);
	}
}

function expandAll(): void {
	document.querySelectorAll('.tree-node').forEach(n => {
		const body = n.querySelector('.tree-children') as HTMLElement;
		const exp = n.querySelector('.expander') as HTMLElement;
		if (body) { body.style.display = ''; (n as HTMLElement).dataset.expanded = 'true'; }
		if (exp) { exp.innerHTML = downChevron(); exp.setAttribute('aria-expanded', 'true'); }
	});
}

function collapseAll(): void {
	document.querySelectorAll('.tree-node').forEach(n => {
		const body = n.querySelector('.tree-children') as HTMLElement;
		const exp = n.querySelector('.expander') as HTMLElement;
		if (body) { body.style.display = 'none'; (n as HTMLElement).dataset.expanded = 'false'; }
		if (exp) { exp.innerHTML = rightChevron(); exp.setAttribute('aria-expanded', 'false'); }
	});
}

function downChevron(): string {
	return '<svg width="10" height="10" viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M2 3 L5 7 L8 3" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}

function rightChevron(): string {
	return '<svg width="10" height="10" viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M3 2 L7 5 L3 8" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}

function computeXPath(node: Element): string {
	if (!node) { return ''; }
	const parts: string[] = [];
	let cur: Element | null = node;
	while (cur && cur.nodeType === Node.ELEMENT_NODE) {
		let idx = 1;
		let sib = cur.previousSibling;
		while (sib) {
			if (sib.nodeType === Node.ELEMENT_NODE && sib.nodeName === cur.nodeName) { idx++; }
			sib = sib.previousSibling;
		}
		parts.unshift(cur.nodeName + '[' + idx + ']');
		cur = cur.parentNode as Element;
	}
	return '/' + parts.join('/');
}

function promptAddAttribute(node: Element): void {
	showInputDialog('Add attribute', ['Name', 'Value'], (vals) => {
		const n = (vals && vals[0]) ? vals[0].trim() : '';
		const v = (vals && vals[1]) ? vals[1] : '';
		if (!n) { showStatus('Attribute name required'); return; }
		node.setAttribute(n, v);
		renderAttributes(node);
		postDocumentChange();
	});
}

// Helper function to get value from either input or select element
function getInputValue(element: HTMLElement): string {
	if (element instanceof HTMLInputElement) {
		return element.value;
	} else if (element instanceof HTMLSelectElement) {
		return element.value;
	}
	return '';
}

// Smart value input with VS Code-style completion that triggers automatically on typing
function createSmartValueInput(attributeName: string, currentValue: string, node: Element): HTMLElement {
	const attrLower = attributeName.toLowerCase();

	// Define attribute-specific value options
	const attributeOptions: Record<string, string[]> = {
		'font-family': [
			'Arial', 'Helvetica', 'Times New Roman', 'Times', 'Georgia', 'Verdana',
			'Courier New', 'Monaco', 'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy'
		],
		'font-size': [
			'8px', '10px', '12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px', '36px', '48px',
			'xx-small', 'x-small', 'small', 'medium', 'large', 'x-large', 'xx-large'
		],
		'font-weight': [
			'normal', 'bold', 'bolder', 'lighter',
			'100', '200', '300', '400', '500', '600', '700', '800', '900'
		],
		'text-anchor': ['start', 'middle', 'end'],
		'fill': [
			'red', 'green', 'blue', 'yellow', 'orange', 'purple', 'pink',
			'brown', 'gray', 'black', 'white', 'cyan', 'magenta',
			'none', 'transparent', 'currentColor'
		],
		'stroke': [
			'red', 'green', 'blue', 'yellow', 'orange', 'purple', 'pink',
			'brown', 'gray', 'black', 'white', 'cyan', 'magenta',
			'none', 'transparent', 'currentColor'
		],
		'stroke-linecap': ['butt', 'round', 'square'],
		'stroke-linejoin': ['miter', 'round', 'bevel']
	};

	const options = attributeOptions[attrLower];

	// Always create an input field (no more dropdowns!)
	const input = document.createElement('input');
	input.type = 'text';
	input.value = currentValue;
	input.className = 'attribute-value-input';

	// Add change listener
	input.addEventListener('change', () => {
		node.setAttribute(attributeName, input.value);
		postDocumentChange();
	});

	// Set up VS Code-style completion if we have options for this attribute
	if (options) {
		setupVSCodeStyleCompletion(input, options);
	}

	return input;
}

/**
 * Sets up VS Code-style completion that triggers automatically on typing
 * This replicates the exact behavior of "font-family=" completion in CSS files
 */
function setupVSCodeStyleCompletion(input: HTMLInputElement, completionOptions: string[]): void {
	let completionContainer: HTMLDivElement | null = null;
	let selectedIndex = -1;
	let filteredItems: string[] = [];

	// Show completion suggestions
	function showCompletions(value: string): void {
		hideCompletions();

		// Filter options based on current input
		filteredItems = completionOptions.filter(option =>
			option.toLowerCase().includes(value.toLowerCase())
		);

		if (filteredItems.length === 0) { return; }

		// Create completion container
		completionContainer = document.createElement('div');
		completionContainer.className = 'vscode-completion-widget';
		completionContainer.style.cssText = `
			position: absolute;
			background: var(--vscode-editorSuggestWidget-background, #252526);
			border: 1px solid var(--vscode-editorSuggestWidget-border, #454545);
			border-radius: 3px;
			box-shadow: 0 2px 8px rgba(0, 0, 0, 0.36);
			max-height: 200px;
			overflow-y: auto;
			z-index: 1000;
			font-family: var(--vscode-editor-font-family, 'Consolas, "Courier New", monospace');
			font-size: var(--vscode-editor-font-size, 14px);
			min-width: 200px;
		`;

		// Position the completion widget
		const inputRect = input.getBoundingClientRect();
		completionContainer.style.left = inputRect.left + 'px';
		completionContainer.style.top = (inputRect.bottom + 2) + 'px';
		completionContainer.style.minWidth = Math.max(inputRect.width, 200) + 'px';

		// Add completion items
		filteredItems.forEach((item, index) => {
			const itemElement = document.createElement('div');
			itemElement.className = 'completion-item';
			itemElement.style.cssText = `
				padding: 4px 8px;
				cursor: pointer;
				white-space: nowrap;
				color: var(--vscode-editorSuggestWidget-foreground, #cccccc);
			`;

			// Highlight matching text
			if (value) {
				const regex = new RegExp(`(${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
				const highlighted = item.replace(regex, '<strong style="color: var(--vscode-editorSuggestWidget-highlightForeground, #0097fb);">$1</strong>');
				itemElement.innerHTML = highlighted;
			} else {
				itemElement.textContent = item;
			}

			// Mouse events
			itemElement.addEventListener('mouseenter', () => {
				selectCompletionItem(index);
			});

			itemElement.addEventListener('click', () => {
				applyCompletion(item);
			});

			completionContainer!.appendChild(itemElement);
		});

		document.body.appendChild(completionContainer);
		selectedIndex = 0;
		selectCompletionItem(0);
	}

	// Hide completion suggestions
	function hideCompletions(): void {
		if (completionContainer) {
			document.body.removeChild(completionContainer);
			completionContainer = null;
		}
		selectedIndex = -1;
		filteredItems = [];
	}

	// Select completion item
	function selectCompletionItem(index: number): void {
		if (!completionContainer) { return; }

		// Remove previous selection
		const items = completionContainer.querySelectorAll('.completion-item');
		items.forEach((item, i) => {
			const element = item as HTMLElement;
			if (i === index) {
				element.style.backgroundColor = 'var(--vscode-editorSuggestWidget-selectedBackground, #094771)';
				element.style.color = 'var(--vscode-editorSuggestWidget-selectedForeground, #ffffff)';
			} else {
				element.style.backgroundColor = 'transparent';
				element.style.color = 'var(--vscode-editorSuggestWidget-foreground, #cccccc)';
			}
		});

		selectedIndex = index;
	}

	// Apply selected completion
	function applyCompletion(value: string): void {
		input.value = value;
		hideCompletions();
		input.focus();
		// Trigger change event
		input.dispatchEvent(new Event('change', { bubbles: true }));
	}

	// Input event handler - triggers on every keystroke (this is the key!)
	input.addEventListener('input', (e) => {
		const value = input.value.trim();
		if (value.length > 0) {
			showCompletions(value);
		} else {
			hideCompletions();
		}
	});

	// Focus event handler - show all options when focusing
	input.addEventListener('focus', () => {
		const value = input.value.trim();
		showCompletions(value);
	});

	// Blur event handler - hide completions when losing focus
	input.addEventListener('blur', (e) => {
		// Delay hiding to allow click on completion items
		setTimeout(() => {
			hideCompletions();
		}, 150);
	});

	// Keyboard navigation
	input.addEventListener('keydown', (e) => {
		if (!completionContainer || filteredItems.length === 0) { return; }

		switch (e.key) {
			case 'ArrowDown':
				e.preventDefault();
				selectedIndex = Math.min(selectedIndex + 1, filteredItems.length - 1);
				selectCompletionItem(selectedIndex);
				break;

			case 'ArrowUp':
				e.preventDefault();
				selectedIndex = Math.max(selectedIndex - 1, 0);
				selectCompletionItem(selectedIndex);
				break;

			case 'Enter':
			case 'Tab':
				e.preventDefault();
				if (selectedIndex >= 0 && selectedIndex < filteredItems.length) {
					applyCompletion(filteredItems[selectedIndex]);
				}
				break;

			case 'Escape':
				e.preventDefault();
				hideCompletions();
				break;
		}
	});
}

function renderAttributes(node: Element): void {
	const attrsContainer = document.getElementById('attributes-container');
	if (!attrsContainer) { return; }
	attrsContainer.innerHTML = '';

	// Create header with save button
	const headerContainer = document.createElement('div');
	headerContainer.style.cssText = 'display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;';

	const h = document.createElement('div');
	h.className = 'attrs-header';
	h.textContent = node.nodeName;
	h.style.flex = '1';

	const saveContainer = document.createElement('div');
	saveContainer.style.cssText = 'display: flex; align-items: center;';

	const saveBtn = document.createElement('button');
	saveBtn.className = 'save-button';
	saveBtn.textContent = 'Save';
	saveBtn.title = 'Save changes (Ctrl+S)';
	saveBtn.addEventListener('click', requestSave);

	const saveStatus = document.createElement('span');
	saveStatus.id = 'save-status';
	saveStatus.className = 'save-status';

	saveContainer.appendChild(saveBtn);
	saveContainer.appendChild(saveStatus);
	headerContainer.appendChild(h);
	headerContainer.appendChild(saveContainer);
	attrsContainer.appendChild(headerContainer);

	// NEW: Add editable text content area
	const textContentContainer = document.createElement('div');
	textContentContainer.className = 'text-content-container';

	const textContentInput = document.createElement('input');
	textContentInput.className = 'text-content-input';

	// find the text node
	let textNode: Text | null = null;
	for (const child of Array.from(node.childNodes)) {
		if (child.nodeType === Node.TEXT_NODE) {
			textNode = child as Text;
			break;
		}
	}

	textContentInput.value = textNode ? textNode.nodeValue?.trim() || '' : '';
	textContentInput.addEventListener('change', () => {
		if (textNode) {
			textNode.nodeValue = textContentInput.value;
		} else {
			// If no text node exists, create one
			node.appendChild(document.createTextNode(textContentInput.value));
		}
		postDocumentChange();
	});
	textContentContainer.appendChild(textContentInput);
	attrsContainer.appendChild(textContentContainer);

	// NEW: Add separator
	const separator = document.createElement('hr');
	separator.className = 'section-separator';
	attrsContainer.appendChild(separator);

	const list = document.createElement('div');
	list.className = 'attrs-list';

	if (node.attributes) {
		for (let i = 0; i < node.attributes.length; i++) {
			const a = node.attributes[i];
			const row = document.createElement('div');
			row.className = 'attr-row';

			const nameInput = document.createElement('input');
			nameInput.className = 'attr-name';
			nameInput.value = a.name;

			const valInput = createSmartValueInput(a.name, a.value, node);
			valInput.className = 'attr-value';

			const del = document.createElement('button');
			del.className = 'attr-del';
			del.textContent = 'Delete';
			del.addEventListener('click', () => {
				node.removeAttribute(a.name);
				renderAttributes(node);
				postDocumentChange();
			});

			nameInput.addEventListener('change', () => {
				const newName = nameInput.value.trim();
				const val = getInputValue(valInput);
				if (newName && newName !== a.name) {
					node.removeAttribute(a.name);
					node.setAttribute(newName, val);
					renderAttributes(node);
					postDocumentChange();
				}
			});

			// Note: valInput already has its own change listener from createSmartValueInput

			row.appendChild(nameInput);
			row.appendChild(valInput);
			row.appendChild(del);
			list.appendChild(row);
		}
	}

	const addRow = document.createElement('div');
	addRow.className = 'attr-add-row';
	const addName = document.createElement('input');
	addName.placeholder = 'name';
	let addVal = document.createElement('input') as HTMLElement;
	if (addVal instanceof HTMLInputElement) {
		addVal.placeholder = 'value';
	}

	// Update the value input when attribute name changes
	addName.addEventListener('input', () => {
		const newName = addName.value.trim();
		if (newName) {
			// Replace the value input with smart input based on attribute name
			const newAddVal = createSmartValueInput(newName, '', node);
			if (newAddVal instanceof HTMLInputElement) {
				newAddVal.placeholder = 'value';
			}
			addRow.replaceChild(newAddVal, addVal);
			addVal = newAddVal;
		}
	});

	const addBtn = document.createElement('button');
	addBtn.textContent = 'Add Attribute';
	addBtn.addEventListener('click', () => {
		const n = addName.value.trim();
		if (!n) { showStatus('Name required'); return; }
		const v = getInputValue(addVal);
		node.setAttribute(n, v || '');
		renderAttributes(node);
		postDocumentChange();
	});

	addRow.appendChild(addName);
	addRow.appendChild(addVal);
	addRow.appendChild(addBtn);
	attrsContainer.appendChild(list);
	attrsContainer.appendChild(addRow);
}

function postDocumentChange(): void {
	try {
		const serializer = new XMLSerializer();
		const xml = serializer.serializeToString(currentDoc || document);
		safePostMessage({ type: 'edit', content: xml });
		showSaveStatus('Modified');
	} catch (e) { console.error('postDocumentChange failed', e); }
}

function requestSave(): void {
	try {
		const serializer = new XMLSerializer();
		const xml = serializer.serializeToString(currentDoc || document);
		// Send a full document save request
		safePostMessage({ type: 'fullDocument', xml: xml });
		showSaveStatus('Saving...');
	} catch (e) {
		console.error('requestSave failed', e);
		showSaveStatus('Save failed');
	}
}

function showSaveStatus(message: string): void {
	const statusEl = document.getElementById('save-status');
	if (statusEl) {
		statusEl.textContent = message;
		if (message === 'Saved') {
			setTimeout(() => {
				statusEl.textContent = '';
			}, 2000);
		}
	}
}

function promptAddChild(node: Element): void {
	showInputDialog('Add child element', ['Name'], (vals) => {
		const name = vals[0] && vals[0].trim();
		if (!name) { showStatus('Child name required'); return; }
		try {
			const child = (currentDoc || node.ownerDocument!).createElement(name);
			node.appendChild(child);
			// re-render tree and re-select
			renderRoot(new XMLSerializer().serializeToString(currentDoc!), true);
			showStatus('Child added');
			postDocumentChange();
		} catch (err) { console.error('add-child failed', err); showStatus('Add child failed'); }
	});
}

function deleteNode(node: Element): void {
	try {
		if (!node.parentNode) { showStatus('Cannot delete root'); return; }
		node.parentNode.removeChild(node);
		renderRoot(new XMLSerializer().serializeToString(currentDoc!), true);
		postDocumentChange();
		showStatus('Element deleted');
	} catch (err) { console.error('delete-node failed', err); showStatus('Delete failed'); }
}

// simple context menu
function showContextMenu(x: number, y: number, items: Array<{ label: string; action: () => void }>): void {
	const existing = document.getElementById('vxe-context-menu');
	if (existing) { existing.remove(); }
	const menu = document.createElement('div');
	menu.id = 'vxe-context-menu';
	menu.className = 'context-menu';
	menu.style.left = x + 'px';
	menu.style.top = y + 'px';
	items.forEach(i => {
		const el = document.createElement('div');
		el.className = 'context-menu-item';
		el.textContent = i.label;
		el.tabIndex = 0;
		el.addEventListener('click', () => {
			try { i.action(); } catch (e) { console.error(e); }
			menu.remove();
		});
		menu.appendChild(el);
	});
	document.body.appendChild(menu);
	setTimeout(() => document.addEventListener('click', () => { menu.remove(); }), 50);
}

function showInputDialog(title: string, labels: string[], callback: (vals: string[]) => void): void {
	try {
		const existing = document.getElementById('vxe-input-dialog');
		if (existing) { existing.remove(); }
		const overlay = document.createElement('div');
		overlay.id = 'vxe-input-dialog';
		overlay.style.position = 'fixed';
		overlay.style.left = '0';
		overlay.style.top = '0';
		overlay.style.right = '0';
		overlay.style.bottom = '0';
		overlay.style.background = 'rgba(0,0,0,0.3)';
		overlay.style.zIndex = '10001';
		const box = document.createElement('div');
		box.style.width = '320px';
		box.style.margin = '120px auto';
		box.style.background = '#fff';
		box.style.padding = '12px';
		box.style.borderRadius = '6px';
		box.style.boxShadow = '0 6px 20px rgba(0,0,0,0.3)';
		const h = document.createElement('div');
		h.textContent = title;
		h.style.fontWeight = '600';
		h.style.marginBottom = '8px';
		box.appendChild(h);
		const inputs: HTMLInputElement[] = [];
		labels.forEach(l => {
			const row = document.createElement('div');
			row.style.marginBottom = '8px';
			const lab = document.createElement('div');
			lab.textContent = l;
			lab.style.fontSize = '12px';
			row.appendChild(lab);
			const inp = document.createElement('input');
			inp.type = 'text';
			inp.style.width = '100%';
			inp.style.boxSizing = 'border-box';
			row.appendChild(inp);
			box.appendChild(row);
			inputs.push(inp);
		});
		const btnRow = document.createElement('div');
		btnRow.style.textAlign = 'right';
		const cancel = document.createElement('button');
		cancel.textContent = 'Cancel';
		cancel.addEventListener('click', () => { overlay.remove(); });
		const ok = document.createElement('button');
		ok.textContent = 'OK';
		ok.style.marginLeft = '8px';
		ok.addEventListener('click', () => {
			const vals = inputs.map(i => i.value);
			overlay.remove();
			try { callback(vals); } catch (e) { console.error(e); }
		});
		btnRow.appendChild(cancel);
		btnRow.appendChild(ok);
		box.appendChild(btnRow);
		overlay.appendChild(box);
		document.body.appendChild(overlay);
		inputs[0].focus();
	} catch (e) { console.error('showInputDialog failed', e); }
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

function parseAttrInput(s: string): [string, string] {
	const m = s.match(/^([^=\s]+)=(?:\"([^\"]*)\"|'([^']*)'|([^\s]*))$/);
	if (m) { return [m[1], m[2] || m[3] || m[4] || '']; }
	const idx = s.indexOf('=');
	if (idx === -1) { return [s, '']; }
	const k = s.substring(0, idx).trim();
	let v = s.substring(idx + 1).trim();
	if (v.length >= 2) {
		const first = v.charCodeAt(0);
		const last = v.charCodeAt(v.length - 1);
		if ((first === 34 && last === 34) || (first === 39 && last === 39)) {
			v = v.substring(1, v.length - 1);
		}
	}
	return [k, v];
}
