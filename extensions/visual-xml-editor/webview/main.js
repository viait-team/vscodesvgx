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
// Basic DOM-tree visual editor for XML. Features:
// - Expand/collapse
// - Edit element text
// - Edit attributes
// - Add/remove child elements
// - Send full serialized XML to extension on changes

window.addEventListener('message', event => {
	const message = event.data;
	switch (message.type) {
		case 'init':
			renderRoot(message.content);
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

// transient status messages shown at top
function showStatus(msg, timeout = 3500) {
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

// Global right-click handler: find the nearest node container and open the context menu.
document.addEventListener('contextmenu', (ev) => {
	// ignore if clicking on our custom menu
	const menu = document.getElementById('vxe-context-menu');
	if (menu && menu.contains(ev.target)) { return; }

	// find nearest parent with class 'node'
	let el = ev.target;
	let nodeContainer = null;
	while (el && el !== document.body) {
		if (el.classList && el.classList.contains && el.classList.contains('node')) { nodeContainer = el; break; }
		el = el.parentNode;
	}
	if (!nodeContainer) { return; }
	ev.preventDefault();
	// retrieve attached xml node reference
	const xmlNode = nodeContainer.__vxe_node;
	// capture the specific edit element that was right-clicked (if any)
	let clickedEdit = null;
	try {
		let walk = ev.target;
		while (walk && walk !== nodeContainer && walk !== document.body) {
			if (walk.tagName === 'TEXTAREA' || walk.tagName === 'INPUT') { clickedEdit = walk; break; }
			walk = walk.parentNode;
		}
	} catch { }
	if (!xmlNode) { return; }

	const x = ev.clientX;
	const y = ev.clientY;
	const items = [
		{
			label: 'Add attribute',
			action: () => {
				try {
					// Prefer the specific element that was right-clicked, then the activeElement, then fallback
					let src = clickedEdit || null;
					if (!src) {
						src = document.activeElement;
						if (src && (src.tagName === 'TEXTAREA' || src.tagName === 'INPUT')) {
							let p = src;
							while (p && p !== nodeContainer && p !== document.body) { p = p.parentNode; }
							if (p !== nodeContainer) { src = null; }
						} else { src = null; }
					}

					if (!src) {
						// fallback: first textarea/input in the node body
						src = nodeContainer.querySelector('.body textarea, .body input, textarea, input');
					}

					if (!src) { showStatus('No edit box found to extract attribute'); return; }
					const raw = (src.value || '').trim();
					if (!raw) { showStatus('Edit box is empty'); return; }
					const [k, v] = parseAttrInput(raw);
					if (!k) { showStatus('Could not parse attribute from edit box'); return; }
					xmlNode.setAttribute(k, v);
					// rebuild header attrs from the real XML node so UI stays in sync
					try {
						const header = nodeContainer.querySelector('.header');
						if (header) {
							const attrs = header.querySelector('.attrs');
							if (attrs) {
								attrs.innerHTML = '';
								for (let i = 0; i < xmlNode.attributes.length; i++) {
									const a = xmlNode.attributes[i];
									const input = document.createElement('input');
									input.value = `${a.name}="${a.value}"`;
									input.addEventListener('change', () => {
										const [nk, nv] = parseAttrInput(input.value);
										if (nk) {
											// if the name changed, remove the old attribute
											if (nk !== a.name) { xmlNode.removeAttribute(a.name); }
											xmlNode.setAttribute(nk, nv);
										}
									});
									attrs.appendChild(input);
								}
							}
						}
					} catch (err) {
						console.error('inline attrs update failed', err);
					}
					// clear the source edit box and blur (no transient message shown)
					try { src.value = ''; if (src.blur) { src.blur(); } } catch (e) { /* ignore */ }
					try {
						const serializer = new XMLSerializer();
						const xml = serializer.serializeToString(currentDoc || xmlNode.ownerDocument);
						safePostMessage({ type: 'edit', content: xml });
					} catch (e) { /* ignore */ }
				} catch (err) {
					console.error('add-attribute failed', err);
					showStatus('Add attribute failed');
				}
			}
		},
		{
			label: 'Add child element',
			action: () => {
				showInputDialog('Add child element', ['Name'], (vals) => {
					const name = vals[0] && vals[0].trim();
					if (!name) { showStatus('Child name required'); return; }
					try {
						const child = (currentDoc || xmlNode.ownerDocument).createElement(name);
						xmlNode.appendChild(child);
						const serializer = new XMLSerializer();
						const xml = serializer.serializeToString(currentDoc || xmlNode.ownerDocument);
						renderRoot(xml);
						showStatus('Child added');
						try { safePostMessage({ type: 'edit', content: xml }); } catch { }
					} catch (err) {
						console.error('add-child failed', err);
						showStatus('Add child failed');
					}
				});
			}
		},
		{
			label: 'Delete element',
			action: () => {
				try {
					if (!xmlNode.parentNode) { showStatus('Cannot delete root'); return; }
					xmlNode.parentNode.removeChild(xmlNode);
					const serializer = new XMLSerializer();
					const xml = serializer.serializeToString(currentDoc || xmlNode.ownerDocument);
					renderRoot(xml);
					showStatus('Element deleted');
					try { safePostMessage({ type: 'edit', content: xml }); } catch { }
				} catch (err) {
					console.error('delete-node failed', err);
					showStatus('Delete failed');
				}
			}
		},
		{
			label: 'Serialize & send to extension',
			action: () => {
				const serializer = new XMLSerializer();
				const rootDoc = currentDoc || xmlNode.ownerDocument;
				const xml = serializer.serializeToString(rootDoc);
				safePostMessage({ type: 'edit', content: xml });
				showStatus('Serialized & sent');
			}
		}
	];
	showContextMenu(x, y, items);
});

function renderRoot(xmlText) {
	const parser = new DOMParser();
	const doc = parser.parseFromString(xmlText, 'application/xml');
	currentDoc = doc;
	const root = document.getElementById('root');
	root.innerHTML = '';
	// no persistent toolbar; actions are available via right-click (context menu)
	const tree = renderNode(doc.documentElement);
	root.appendChild(tree);
}

// create a simple floating context menu. Items are functions that receive the target node.
function showContextMenu(x, y, items) {
	// remove existing
	const existing = document.getElementById('vxe-context-menu');
	if (existing) { existing.parentNode.removeChild(existing); }

	const menu = document.createElement('div');
	menu.id = 'vxe-context-menu';
	menu.className = 'context-menu';
	menu.style.left = x + 'px';
	menu.style.top = y + 'px';

	items.forEach(i => {
		const el = document.createElement('div');
		el.className = 'context-menu-item';
		el.textContent = i.label;
		// ensure item is enabled and focusable
		el.setAttribute('role', 'menuitem');
		el.setAttribute('aria-disabled', 'false');
		el.tabIndex = 0;
		el.style.pointerEvents = 'auto';
		el.style.opacity = '1';

		el.addEventListener('mousedown', (e) => { e.stopPropagation(); });
		el.addEventListener('click', (ev) => {
			try { i.action(); } catch (e) { console.error(e); showStatus('Action failed'); }
			if (menu.parentNode) { menu.parentNode.removeChild(menu); }
		});
		el.addEventListener('keydown', (ev) => {
			if (ev.key === 'Enter' || ev.key === ' ') {
				ev.preventDefault();
				el.click();
			}
		});
		menu.appendChild(el);
	});

	document.body.appendChild(menu);
	// focus the menu so keyboard events work
	try { menu.tabIndex = -1; menu.focus(); } catch { }

	// prevent mousedown inside the menu from closing it (some browsers fire click immediately)
	menu.addEventListener('mousedown', (e) => { e.stopPropagation(); });

	const onClick = (e) => {
		if (!menu.contains(e.target)) {
			menu.remove();
			document.removeEventListener('click', onClick);
		}
	};

	// Delay attaching the click listener so the initial mouseup/click that triggered
	// the contextmenu doesn't immediately close the menu.
	setTimeout(() => document.addEventListener('click', onClick), 50);
}

function renderNode(node) {
	if (!node) { return document.createElement('div'); }
	const container = document.createElement('div');
	container.className = 'node';

	// attach the XML node reference early so global handlers can find it
	try { container.__vxe_node = node; } catch { /* ignore */ }

	if (node.nodeType === Node.ELEMENT_NODE) {
		const header = document.createElement('div');
		header.className = 'header';

		const exp = document.createElement('button');
		exp.textContent = '-';
		exp.addEventListener('click', () => {
			const body = container.querySelector('.body');
			if (body.style.display === 'none') { body.style.display = ''; exp.textContent = '-'; }
			else { body.style.display = 'none'; exp.textContent = '+'; }
		});
		header.appendChild(exp);

		const name = document.createElement('span');
		name.className = 'name';
		name.textContent = node.nodeName;
		header.appendChild(name);

		// attributes
		const attrs = document.createElement('span');
		attrs.className = 'attrs';
		for (let i = 0; i < node.attributes.length; i++) {
			const a = node.attributes[i];
			const input = document.createElement('input');
			input.value = `${a.name}="${a.value}"`;
			input.addEventListener('change', () => {
				const [k, v] = parseAttrInput(input.value);
				node.setAttribute(k, v);
			});
			attrs.appendChild(input);
		}
		header.appendChild(attrs);

		// (no persistent Add attr button - use the popup context menu)

		// (already attached earlier)

		container.appendChild(header);

		const body = document.createElement('div');
		body.className = 'body';
		// children
		for (let c = 0; c < node.childNodes.length; c++) {
			const child = node.childNodes[c];
			if (child.nodeType === Node.TEXT_NODE) {
				const p = document.createElement('div');
				p.className = 'textnode';
				const input = document.createElement('textarea');
				input.value = child.nodeValue;
				input.addEventListener('change', () => { child.nodeValue = input.value; });
				p.appendChild(input);
				body.appendChild(p);
			} else if (child.nodeType === Node.ELEMENT_NODE) {
				body.appendChild(renderNode(child));
			}
		}

		container.appendChild(body);
	} else {
		container.textContent = node.nodeName;
	}

	return container;
}

// small modal input dialog used instead of window.prompt (more reliable in webviews)
function showInputDialog(title, labels, callback) {
	try {
		// remove existing dialog
		const existing = document.getElementById('vxe-input-dialog');
		if (existing) { existing.remove(); }

		const overlay = document.createElement('div');
		overlay.id = 'vxe-input-dialog';
		overlay.style.position = 'fixed';
		overlay.style.left = '0'; overlay.style.top = '0'; overlay.style.right = '0'; overlay.style.bottom = '0';
		overlay.style.background = 'rgba(0,0,0,0.3)';
		overlay.style.zIndex = 10001;

		const box = document.createElement('div');
		box.style.width = '320px'; box.style.margin = '120px auto'; box.style.background = '#fff'; box.style.padding = '12px'; box.style.borderRadius = '6px';
		box.style.boxShadow = '0 6px 20px rgba(0,0,0,0.3)'; box.style.fontFamily = 'sans-serif';

		const h = document.createElement('div'); h.textContent = title; h.style.fontWeight = '600'; h.style.marginBottom = '8px'; box.appendChild(h);

		const inputs = [];
		labels.forEach(l => {
			const row = document.createElement('div'); row.style.marginBottom = '8px';
			const lab = document.createElement('div'); lab.textContent = l; lab.style.fontSize = '12px'; row.appendChild(lab);
			const inp = document.createElement('input'); inp.type = 'text'; inp.style.width = '100%'; inp.style.boxSizing = 'border-box'; row.appendChild(inp);
			box.appendChild(row); inputs.push(inp);
		});

		const btnRow = document.createElement('div'); btnRow.style.textAlign = 'right';
		const cancel = document.createElement('button'); cancel.textContent = 'Cancel'; cancel.addEventListener('click', () => { overlay.remove(); });
		const ok = document.createElement('button'); ok.textContent = 'OK'; ok.style.marginLeft = '8px';
		ok.addEventListener('click', () => {
			const vals = inputs.map(i => i.value);
			overlay.remove();
			try { callback(vals); } catch (e) { console.error(e); }
		});
		btnRow.appendChild(cancel); btnRow.appendChild(ok); box.appendChild(btnRow);

		overlay.appendChild(box); document.body.appendChild(overlay);
		inputs[0].focus();
		return overlay;
	} catch (e) { console.error('showInputDialog failed', e); }
}

function parseAttrInput(s) {
	const m = s.match(/^([^=\s]+)=(?:\"([^\"]*)\"|'([^']*)'|([^\s]*))$/);
	if (m) { return [m[1], m[2] || m[3] || m[4] || '']; }
	// fallback split on =
	const idx = s.indexOf('=');
	if (idx === -1) { return [s, '']; }
	const k = s.substring(0, idx).trim();
	let v = s.substring(idx + 1).trim();
	// remove surrounding single or double quotes if present (use char codes to avoid quoting lint rules)
	if (v.length >= 2) {
		const first = v.charCodeAt(0);
		const last = v.charCodeAt(v.length - 1);
		if ((first === 34 && last === 34) || (first === 39 && last === 39)) {
			v = v.substring(1, v.length - 1);
		}
	}
	return [k, v];
}

// notify extension that webview is ready
safePostMessage({ type: 'ready' });
