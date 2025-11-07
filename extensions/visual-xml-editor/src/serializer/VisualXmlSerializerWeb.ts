/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// VisualXmlSerializerWeb.ts
import { VisualXmlSerializerBase, DocumentModel, ByteRange, AttributeEditDescriptor, ElementIndex } from './VisualXmlSerializerBase';

/**
 * Webview-side serializer following the Markdown-style text-first pattern.
 *
 * - deserialize preserves the original text verbatim in DocumentModel.content and
 *   optionally computes a conservative index for quick lookups (best-effort).
 * - serialize returns model.content (no lossy DOM->string roundtrip).
 * - findAttributeRange implements the same anchored search as the Node implementation,
 *   usable by the webview when computing edits to request from the extension host.
 *
 * Note: DOM parsing may be used for UI only, never to produce the canonical saved string.
 */
export class VisualXmlSerializerWeb extends VisualXmlSerializerBase {
	async deserialize(content: string): Promise<DocumentModel> {
		// Keep the original text verbatim. Build a conservative index for webview use.
		const index = this.buildConservativeIndex(content, true);
		return { content, index };
	}

	async serialize(model: DocumentModel): Promise<string> {
		// Do not reserialize via DOM here. Return the canonical text.
		return model.content;
	}

	/**
	 * Find attribute byte-range in model.content. Mirrors the Node implementation.
	 */
	async findAttributeRange(model: DocumentModel, edit: AttributeEditDescriptor): Promise<ByteRange | null> {
		const idx = model.index;
		const text = model.content;

		// 1) Try index lookup
		if (idx && idx.length > 0) {
			const id = edit.selector.id;
			if (id) {
				for (const rec of idx) {
					if (rec.id === id) {
						const attr = rec.attrs[edit.attrName];
						if (attr) return { start: attr.valueStart, end: attr.valueEnd };
						return null;
					}
				}
			}
			if (edit.selector.tag) {
				const occ = edit.selector.occurrence ?? 0;
				let found = 0;
				for (const rec of idx) {
					if (rec.tag === edit.selector.tag) {
						if (found++ === occ) {
							const attr = rec.attrs[edit.attrName];
							if (attr) return { start: attr.valueStart, end: attr.valueEnd };
							return null;
						}
					}
				}
			}
		}

		// 2) Fallback: anchored search in text
		if (edit.selector.id) {
			const idRegex = new RegExp(`\\b(id)\\s*=\\s*(['"])${escapeRegExp(edit.selector.id)}\\2`, 'g');
			let m;
			let found = 0;
			while ((m = idRegex.exec(text)) !== null) {
				if (found++ < (edit.selector.occurrence ?? 0)) continue;
				const idIndex = m.index;
				const tagStart = text.lastIndexOf('<', idIndex);
				const tagEnd = text.indexOf('>', idIndex);
				if (tagStart === -1 || tagEnd === -1) continue;
				const tagText = text.slice(tagStart, tagEnd + 1);
				const rel = this.findAttrInTagText(tagText, edit.attrName);
				if (!rel) continue;
				return { start: tagStart + rel.start, end: tagStart + rel.end };
			}
			return null;
		}

		if (edit.selector.tag) {
			const tagRegex = new RegExp(`<${escapeRegExp(edit.selector.tag)}\\b([^>]*)>`, 'g');
			let m;
			let found = 0;
			while ((m = tagRegex.exec(text)) !== null) {
				if (found++ < (edit.selector.occurrence ?? 0)) continue;
				const tagStart = m.index;
				const tagText = m[0];
				const rel = this.findAttrInTagText(tagText, edit.attrName);
				if (!rel) continue;
				return { start: tagStart + rel.start, end: tagStart + rel.end };
			}
			return null;
		}

		return null;
	}

	/**
	 * Conservative index builder: finds start tags and attributes and records offsets.
	 * This is a best-effort index for webview use; it does not modify content.
	 */
	private buildConservativeIndex(content: string, scanForIds = true): ElementIndex[] {
		const out: ElementIndex[] = [];
		const tagRegex = /<([A-Za-z0-9:_-]+)\b([^>]*)>/g;
		let m: RegExpExecArray | null;
		while ((m = tagRegex.exec(content)) !== null) {
			const tag = m[1];
			const attrsText = m[2] || '';
			const tagStart = m.index;
			const tagEnd = m.index + m[0].length;
			const attrs: Record<string, { valueStart: number; valueEnd: number }> = {};
			const attrRegex = /\b([A-Za-z_:][A-Za-z0-9:_.-]*)\s*=\s*(['"])([\s\S]*?)\2/g;
			let am: RegExpExecArray | null;
			while ((am = attrRegex.exec(attrsText)) !== null) {
				const attrName = am[1];
				const val = am[3];
				const attrsTextStartInDoc = tagStart + m[0].indexOf(attrsText);
				const valueStart = attrsTextStartInDoc + am.index + am[0].indexOf(am[2]) + 1;
				const valueEnd = valueStart + val.length;
				attrs[attrName] = { valueStart, valueEnd };
			}
			const rec: ElementIndex = { tag, tagStart, tagEnd, attrs };
			if (scanForIds) {
				const idAttr = attrs['id'] || attrs['ID'] || attrs['Id'];
				if (idAttr) {
					rec.id = content.slice(idAttr.valueStart, idAttr.valueEnd);
				}
			}
			out.push(rec);
		}
		return out;
	}

	private findAttrInTagText(tagText: string, attrName: string): { start: number; end: number } | null {
		const attrPattern = new RegExp(`\\b${escapeRegExp(attrName)}\\s*=\\s*(['"])([\\s\\S]*?)\\1`);
		const am = attrPattern.exec(tagText);
		if (!am) return null;
		const quoteIndexInMatch = am[0].indexOf(am[1]);
		const valueStart = am.index + quoteIndexInMatch + 1;
		const valueEnd = valueStart + am[2].length;
		return { start: valueStart, end: valueEnd };
	}
}

/* Helpers */
function escapeRegExp(s: string) {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
