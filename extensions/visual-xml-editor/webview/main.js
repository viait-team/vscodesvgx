/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const vscode = acquireVsCodeApi();

// Guard to avoid posting messages or running timers during unload/shutdown
let isClosing = false;
function safePostMessage(msg) {
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

// Simple two-panel visual XML editor (left: tree, right: attributes)
window.addEventListener('message', event => {
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
	}
});

let currentDoc = null;
let selectedNode = null;

function showStatus(msg, timeout = 2500) {
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
			s.style.zIndex = 10000;
			document.body.appendChild(s);
		}
		s.textContent = msg;
		s.style.display = '';
		setTimeout(() => { try { s.style.display = 'none'; } catch { } }, timeout);
	} catch (e) { /* ignore */ }
}

function renderRoot(xmlText, twoPanel) {
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
	const btn = (label, title, handler) => {
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
	(function setupResizer() {
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

		function onMove(e) {
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
	})();
}

function createTreeNode(node) {
	const container = document.createElement('div');
	container.className = 'tree-node';
	container.__vxe_node = node;

	// header
	const header = document.createElement('div');
	header.className = 'tree-header';

	const exp = document.createElement('button');
	exp.className = 'expander';
	// Provide chevron HTML. Prefer codicon font if available, otherwise use inline SVG fallback.
	// Detection: create a temporary element with codicon class and inspect computed font-family.
	let _codiconAvailable = undefined;
	function checkCodiconAvailable() {
		if (typeof _codiconAvailable !== 'undefined') { return _codiconAvailable; }
		try {
			const s = document.createElement('span');
			s.className = 'codicon codicon-chevron-right';
			s.style.position = 'absolute'; s.style.visibility = 'hidden'; s.style.pointerEvents = 'none';
			document.body.appendChild(s);
			const ff = window.getComputedStyle(s).getPropertyValue('font-family') || '';
			document.body.removeChild(s);
			_codiconAvailable = ff.toLowerCase().indexOf('codicon') !== -1 || ff.toLowerCase().indexOf('codicon') !== -1;
		} catch (e) { _codiconAvailable = false; }
		return _codiconAvailable;
	}

	function rightChevron() {
		if (checkCodiconAvailable()) { return '<span class="codicon codicon-chevron-right" aria-hidden="true"></span>'; }
		return '<svg width="10" height="10" viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M3 2 L7 5 L3 8" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
	}
	function downChevron() {
		if (checkCodiconAvailable()) { return '<span class="codicon codicon-chevron-down" aria-hidden="true"></span>'; }
		return '<svg width="10" height="10" viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M2 3 L5 7 L8 3" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
	}
	const hasChildren = node.childNodes && Array.from(node.childNodes).some(n => n.nodeType === Node.ELEMENT_NODE);
	if (hasChildren) { exp.innerHTML = rightChevron(); container.dataset.expanded = 'false'; exp.setAttribute('aria-expanded', 'false'); exp.setAttribute('aria-label', 'Expand'); }
	else { exp.innerHTML = ''; container.dataset.expanded = 'false'; exp.setAttribute('aria-hidden', 'true'); }
	header.appendChild(exp);

	const name = document.createElement('span');
	name.className = 'tree-name';
	name.textContent = node.nodeName;
	header.appendChild(name);

	// inline attrs count
	//const count = document.createElement('span');
	//count.className = 'tree-attrs-count';
	//count.textContent = node.attributes && node.attributes.length ? ` ${node.attributes.length}` : '';
	//header.appendChild(count);

	header.addEventListener('click', () => { selectNode(node, container); });

	container.appendChild(header);

	const body = document.createElement('div');
	body.className = 'tree-children';
	Array.from(node.childNodes).forEach(child => {
		if (child.nodeType === Node.ELEMENT_NODE) {
			body.appendChild(createTreeNode(child));
		}
	});
	container.appendChild(body);

	// expander
	exp.addEventListener('click', (ev) => {
		ev.stopPropagation();
		if (body.style.display === 'none' || container.dataset.expanded === 'false') { body.style.display = ''; exp.innerHTML = downChevron(); container.dataset.expanded = 'true'; exp.setAttribute('aria-expanded', 'true'); exp.setAttribute('aria-label', 'Collapse'); }
		else { body.style.display = 'none'; exp.innerHTML = rightChevron(); container.dataset.expanded = 'false'; exp.setAttribute('aria-expanded', 'false'); exp.setAttribute('aria-label', 'Expand'); }
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
		const items = [];
		items.push({ label: 'Copy XPath', action: () => { try { const path = computeXPath(node); safePostMessage({ type: 'debug', msg: 'xpath:' + path }); showStatus('Copied XPath to output'); } catch { } } });
		items.push({ label: 'Add attribute', action: () => { promptAddAttribute(node); } });
		items.push({ label: 'Add child', action: () => { promptAddChild(node); } });
		if (node.attributes && node.attributes.length) { items.push({ label: 'Edit attributes', action: () => { selectNode(node); } }); }
		// only allow delete if not root
		if (node.parentNode) { items.push({ label: 'Delete', action: () => { deleteNode(node); } }); }
		showContextMenu(ev.clientX, ev.clientY, items);
	});

	return container;
}

function selectNode(node, containerEl) {
	selectedNode = node;
	// clear previous selection
	document.querySelectorAll('.tree-header.selected').forEach(h => h.classList.remove('selected'));
	try {
		if (!containerEl) {
			// find element
			const all = document.querySelectorAll('[__vxe_node]');
		}
		// highlight header for the node
		const headers = Array.from(document.querySelectorAll('.tree-node')).filter(n => n.__vxe_node === node).map(n => n.querySelector('.tree-header'));
		headers.forEach(h => { if (h) { h.classList.add('selected'); } });
	} catch { }
	renderAttributes(node);
}

function expandAll() {
	document.querySelectorAll('.tree-node').forEach(n => {
		const body = n.querySelector('.tree-children');
		const exp = n.querySelector('.expander');
		if (body) { body.style.display = ''; n.dataset.expanded = 'true'; }
		if (exp) { exp.innerHTML = downChevron(); exp.setAttribute('aria-expanded', 'true'); }
	});
}

function collapseAll() {
	document.querySelectorAll('.tree-node').forEach(n => {
		const body = n.querySelector('.tree-children');
		const exp = n.querySelector('.expander');
		if (body) { body.style.display = 'none'; n.dataset.expanded = 'false'; }
		if (exp) { exp.innerHTML = rightChevron(); exp.setAttribute('aria-expanded', 'false'); }
	});
}

function computeXPath(node) {
	if (!node) { return ''; }
	const parts = [];
	let cur = node;
	while (cur && cur.nodeType === Node.ELEMENT_NODE) {
		let idx = 1;
		let sib = cur.previousSibling;
		while (sib) {
			if (sib.nodeType === Node.ELEMENT_NODE && sib.nodeName === cur.nodeName) { idx++; }
			sib = sib.previousSibling;
		}
		parts.unshift(cur.nodeName + '[' + idx + ']');
		cur = cur.parentNode;
	}
	return '/' + parts.join('/');
}

function promptAddAttribute(node) {
	showInputDialog('Add attribute', ['Name', 'Value'], (vals) => {
		const n = (vals && vals[0]) ? vals[0].trim() : ''; const v = (vals && vals[1]) ? vals[1] : '';
		if (!n) { showStatus('Attribute name required'); return; }
		node.setAttribute(n, v);
		renderAttributes(node);
		postDocumentChange();
	});
}

function renderAttributes(node) {
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
	let textNode = null;
	for (const child of node.childNodes) {
		if (child.nodeType === Node.TEXT_NODE) {
			textNode = child;
			break;
		}
	}

	textContentInput.value = textNode ? textNode.nodeValue.trim() : '';
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
	const addName = document.createElement('input'); addName.placeholder = 'name';
	const addVal = document.createElement('input'); addVal.placeholder = 'value';
	const addBtn = document.createElement('button'); addBtn.textContent = 'Add Attribute';
	addBtn.addEventListener('click', () => {
		const n = addName.value.trim();
		if (!n) { showStatus('Name required'); return; }
		node.setAttribute(n, addVal.value || '');
		renderAttributes(node);
		postDocumentChange();
	});

	addRow.appendChild(addName); addRow.appendChild(addVal); addRow.appendChild(addBtn);
	attrsContainer.appendChild(list);
	attrsContainer.appendChild(addRow);

	// actions: add child / delete element
	/* 	const actionRow = document.createElement('div'); actionRow.className = 'attr-actions';
		const addChildBtn = document.createElement('button'); addChildBtn.textContent = 'Add child';
		addChildBtn.addEventListener('click', () => { promptAddChild(node); });
		const deleteBtn = document.createElement('button'); deleteBtn.textContent = 'Delete element';
		deleteBtn.addEventListener('click', () => { deleteNode(node); });
		actionRow.appendChild(addChildBtn); actionRow.appendChild(deleteBtn);
		attrsContainer.appendChild(actionRow);
	*/
}

function postDocumentChange() {
	try {
		const serializer = new XMLSerializer();
		const xml = serializer.serializeToString(currentDoc || document);
		safePostMessage({ type: 'edit', content: xml });
	} catch (e) { console.error('postDocumentChange failed', e); }
}

function promptAddChild(node) {
	showInputDialog('Add child element', ['Name'], (vals) => {
		const name = vals[0] && vals[0].trim();
		if (!name) { showStatus('Child name required'); return; }
		try {
			const child = (currentDoc || node.ownerDocument).createElement(name);
			node.appendChild(child);
			// re-render tree and re-select
			renderRoot(new XMLSerializer().serializeToString(currentDoc), true);
			showStatus('Child added');
			postDocumentChange();
		} catch (err) { console.error('add-child failed', err); showStatus('Add child failed'); }
	});
}

function deleteNode(node) {
	try {
		if (!node.parentNode) { showStatus('Cannot delete root'); return; }
		node.parentNode.removeChild(node);
		renderRoot(new XMLSerializer().serializeToString(currentDoc), true);
		postDocumentChange();
		showStatus('Element deleted');
	} catch (err) { console.error('delete-node failed', err); showStatus('Delete failed'); }
}

// simple context menu
function showContextMenu(x, y, items) {
	const existing = document.getElementById('vxe-context-menu');
	if (existing) { existing.remove(); }
	const menu = document.createElement('div'); menu.id = 'vxe-context-menu'; menu.className = 'context-menu';
	menu.style.left = x + 'px'; menu.style.top = y + 'px';
	items.forEach(i => {
		const el = document.createElement('div'); el.className = 'context-menu-item'; el.textContent = i.label;
		el.tabIndex = 0; el.addEventListener('click', () => { try { i.action(); } catch (e) { console.error(e); } menu.remove(); });
		menu.appendChild(el);
	});
	document.body.appendChild(menu);
	setTimeout(() => document.addEventListener('click', () => { menu.remove(); }), 50);
}

function showInputDialog(title, labels, callback) {
	try {
		const existing = document.getElementById('vxe-input-dialog'); if (existing) { existing.remove(); }
		const overlay = document.createElement('div'); overlay.id = 'vxe-input-dialog'; overlay.style.position = 'fixed'; overlay.style.left = '0'; overlay.style.top = '0'; overlay.style.right = '0'; overlay.style.bottom = '0'; overlay.style.background = 'rgba(0,0,0,0.3)'; overlay.style.zIndex = 10001;
		const box = document.createElement('div'); box.style.width = '320px'; box.style.margin = '120px auto'; box.style.background = '#fff'; box.style.padding = '12px'; box.style.borderRadius = '6px'; box.style.boxShadow = '0 6px 20px rgba(0,0,0,0.3)';
		const h = document.createElement('div'); h.textContent = title; h.style.fontWeight = '600'; h.style.marginBottom = '8px'; box.appendChild(h);
		const inputs = [];
		labels.forEach(l => { const row = document.createElement('div'); row.style.marginBottom = '8px'; const lab = document.createElement('div'); lab.textContent = l; lab.style.fontSize = '12px'; row.appendChild(lab); const inp = document.createElement('input'); inp.type = 'text'; inp.style.width = '100%'; inp.style.boxSizing = 'border-box'; row.appendChild(inp); box.appendChild(row); inputs.push(inp); });
		const btnRow = document.createElement('div'); btnRow.style.textAlign = 'right'; const cancel = document.createElement('button'); cancel.textContent = 'Cancel'; cancel.addEventListener('click', () => { overlay.remove(); }); const ok = document.createElement('button'); ok.textContent = 'OK'; ok.style.marginLeft = '8px'; ok.addEventListener('click', () => { const vals = inputs.map(i => i.value); overlay.remove(); try { callback(vals); } catch (e) { console.error(e); } }); btnRow.appendChild(cancel); btnRow.appendChild(ok); box.appendChild(btnRow);
		overlay.appendChild(box); document.body.appendChild(overlay); inputs[0].focus(); return overlay;
	} catch (e) { console.error('showInputDialog failed', e); }
}

function parseAttrInput(s) {
	const m = s.match(/^([^=\s]+)=(?:"([^"]*)"|'([^']*)'|([^\s]*))$/);
	if (m) { return [m[1], m[2] || m[3] || m[4] || '']; }
	const idx = s.indexOf('='); if (idx === -1) { return [s, '']; }
	const k = s.substring(0, idx).trim(); let v = s.substring(idx + 1).trim();
	if (v.length >= 2) { const first = v.charCodeAt(0); const last = v.charCodeAt(v.length - 1); if ((first === 34 && last === 34) || (first === 39 && last === 39)) { v = v.substring(1, v.length - 1); } }
	return [k, v];
}

// initial ready notification
safePostMessage({ type: 'ready' });
