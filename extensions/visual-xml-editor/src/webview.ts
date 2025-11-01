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

// Guard to avoid posting messages or running timers during unload/shutdown
let isClosing = false;
function safePostMessage(msg: any): void {
	if (isClosing) { return; }
	try {
		// Post asynchronously to avoid illegal access when the host is tearing down.
		setTimeout(() => {
			if (isClosing) { return; }
			try {
				if (typeof vscode === 'object' && typeof vscode.postMessage === 'function') {
					vscode.postMessage(msg);
				}
			} catch (e) {
				try { console.warn('postMessage failed (ignored):', e); } catch { }
			}
		}, 0);
	} catch (e) {
		try { console.warn('safePostMessage scheduling failed', e); } catch { }
	}
}

window.addEventListener('beforeunload', () => { isClosing = true; });
window.addEventListener('unload', () => { isClosing = true; });
window.addEventListener('pagehide', () => { isClosing = true; });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { isClosing = true; } });

// Send ready message when the webview loads to request initial content
document.addEventListener('DOMContentLoaded', () => {
	safePostMessage({ type: 'ready' });
});

// Simple two-panel visual XML editor (left: tree, right: attributes)
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
			console.log('[5/8] Editor Webview: Received selectInTree message');
			selectElementInTree(message.data);
			break;
	}
});

function selectElementInTree(elementInfo: any) {
    console.log('[6/8] Editor Webview: Finding element in tree');
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
        console.log('[7/8] Editor Webview: Element found, selecting node');
        selectNode(element);
        console.log('[8/8] Editor Webview: Node selected');
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
		setTimeout(() => { try { s!.style.display = 'none'; } catch { } }, timeout);
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
		headers.forEach(h => { if (h) { h.classList.add('selected'); } });
	} catch { }
	renderAttributes(node);

	// NEW: Send message to sync with preview automatically
	try {
		const elementInfo = extractElementInfo(node);
		if (elementInfo) {
			console.log(`[1/8] Editor: User clicked element ${elementInfo.id || elementInfo.tagName}`);
			console.log(`[2/8] Editor: Sending highlight message to extension host`);
			safePostMessage({
				type: 'syncToPreview',
				elementInfo: elementInfo
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

function renderAttributes(node: Element): void {
	const attrsContainer = document.getElementById('attributes-container');
	if (!attrsContainer) { return; }
	attrsContainer.innerHTML = '';

	const h = document.createElement('div');
	h.className = 'attrs-header';
	h.textContent = node.nodeName;
	attrsContainer.appendChild(h);

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

			const valInput = document.createElement('input');
			valInput.className = 'attr-value';
			valInput.value = a.value;

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
				const val = valInput.value;
				if (newName && newName !== a.name) {
					node.removeAttribute(a.name);
					node.setAttribute(newName, val);
					renderAttributes(node);
					postDocumentChange();
				}
			});

			valInput.addEventListener('change', () => {
				node.setAttribute(a.name, valInput.value);
				postDocumentChange();
			});

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
	const addVal = document.createElement('input');
	addVal.placeholder = 'value';
	const addBtn = document.createElement('button');
	addBtn.textContent = 'Add Attribute';
	addBtn.addEventListener('click', () => {
		const n = addName.value.trim();
		if (!n) { showStatus('Name required'); return; }
		node.setAttribute(n, addVal.value || '');
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
	} catch (e) { console.error('postDocumentChange failed', e); }
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



