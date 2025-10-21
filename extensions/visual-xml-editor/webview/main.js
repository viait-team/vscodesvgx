/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const vscode = acquireVsCodeApi();

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
			break;
	}
});

function renderRoot(xmlText) {
	const parser = new DOMParser();
	const doc = parser.parseFromString(xmlText, 'application/xml');
	const root = document.getElementById('root');
	root.innerHTML = '';
	const toolbar = createToolbar(doc);
	root.appendChild(toolbar);
	const tree = renderNode(doc.documentElement);
	root.appendChild(tree);
}

function createToolbar(doc) {
	const bar = document.createElement('div');
	const saveBtn = document.createElement('button');
	saveBtn.textContent = 'Send to Extension (serialize)';
	saveBtn.addEventListener('click', () => {
		const serializer = new XMLSerializer();
		const xml = serializer.serializeToString(doc);
		vscode.postMessage({ type: 'edit', content: xml });
	});
	bar.appendChild(saveBtn);
	return bar;
}

function renderNode(node) {
	if (!node) { return document.createElement('div'); }
	const container = document.createElement('div');
	container.className = 'node';

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

		// add attribute button
		const addAttr = document.createElement('button');
		addAttr.textContent = 'Add attr';
		addAttr.addEventListener('click', () => {
			const k = prompt("Attribute name");
			if (!k) { return; }
			const v = prompt("Attribute value") || "";
			node.setAttribute(k, v);
			// re-render node
			const newNode = renderNode(node);
			container.parentNode.replaceChild(newNode, container);
		});
		header.appendChild(addAttr);

		// add child element
		const addChild = document.createElement('button');
		addChild.textContent = 'Add child';
		addChild.addEventListener('click', () => {
			const name = prompt("Child element name");
			if (!name) { return; }
			const child = node.ownerDocument.createElement(name);
			node.appendChild(child);
			const newNode = renderNode(node);
			container.parentNode.replaceChild(newNode, container);
		});
		header.appendChild(addChild);

		// delete element
		const del = document.createElement('button');
		del.textContent = 'Delete';
		del.addEventListener('click', () => {
			if (!node.parentNode) { alert("Cannot delete root"); return; }
			node.parentNode.removeChild(node);
			// refresh parent
			const parentContainer = container.parentNode;
			parentContainer.removeChild(container);
		});
		header.appendChild(del);

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

function parseAttrInput(s) {
	const m = s.match(/^([^=\s]+)=(?:\"([^\"]*)\"|'([^']*)'|([^\s]*))$/);
	if (m) { return [m[1], m[2] || m[3] || m[4] || '']; }
	// fallback split on =
	const idx = s.indexOf('=');
	if (idx === -1) { return [s, '']; }
	const k = s.substring(0, idx).trim();
	let v = s.substring(idx + 1).trim();
	if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) { v = v.substring(1, v.length - 1); }
	return [k, v];
}

// notify extension that webview is ready
vscode.postMessage({ type: 'ready' });
