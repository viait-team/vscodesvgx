/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// VisualXmlSerializerBase.ts
import * as vscode from 'vscode';

/**
 * Canonical document model used by the serializer.
 * - content is the exact, original file text (UTF-8 string).
 * - index is an optional conservative positional index that implementations MAY provide
 *   to speed up locating elements/attributes for minimal replacements.
 */
export interface DocumentModel {
	content: string;
	/** Optional conservative index mapping elements to offsets */
	index?: ElementIndex[];
}

/**
 * Conservative index record for implementation use.
 * Implementations may extend this shape but must keep these fields stable.
 */
export type ElementIndex = {
	/** optional id attribute value if detected */
	id?: string;
	/** element tag name (lower/upper preserved as implementation chooses) */
	tag: string;
	/** byte offset of '<' at start of start-tag */
	tagStart: number;
	/** byte offset immediately after '>' of start-tag */
	tagEnd: number;
	/** map attrName -> value offsets (valueStart inclusive, valueEnd exclusive) */
	attrs: Record<string, { valueStart: number; valueEnd: number }>;
};

/**
 * Descriptor that identifies a single attribute edit requested from the UI.
 * Implementations should support selector.id as primary stable anchor. If selector.tag
 * is used, occurrence indexes the Nth start-tag occurrence (0-based).
 */
export interface AttributeEditDescriptor {
	selector: { id?: string; tag?: string; occurrence?: number };
	attrName: string;
	newValue: string;
}

/**
 * TextRange as byte offsets in the document content.
 * start inclusive, end exclusive.
 */
export interface ByteRange {
	start: number;
	end: number;
}

/**
 * VisualXmlSerializerBase — text-first serializer interface.
 *
 * Key points:
 * - deserialize must preserve the original text verbatim in DocumentModel.content.
 * - deserialize MAY compute and return a conservative index to help compute minimal edits.
 * - serialize MUST NOT perform a lossy DOM->string full rewrite as the default save path.
 *   Instead, implementations should provide methods to compute minimal byte ranges for edits.
 * - findAttributeRange is provided as a helper contract that finds the byte range of an
 *   attribute value inside the canonical content. Extension hosts use the returned ByteRange
 *   to create a WorkspaceEdit.replace for the attribute value.
 */
export abstract class VisualXmlSerializerBase {
	/**
	 * Convert raw file text into a DocumentModel.
	 * Implementations MUST return the original text verbatim in model.content.
	 * They MAY also populate model.index (a conservative positional index).
	 */
	abstract deserialize(content: string): Promise<DocumentModel>;

	/**
	 * Serialize the DocumentModel back to a string.
	 * Default contract: return model.content (no lossy reserialization).
	 * Implementations may override to perform non-lossy transforms, but such operations
	 * must be explicit and gated by user confirmation in the extension host.
	 */
	abstract serialize(model: DocumentModel): Promise<string>;

	/**
	 * Given a DocumentModel and an AttributeEditDescriptor, locate the byte-range of the
	 * attribute value in model.content. Return null if the location cannot be found
	 * reliably. The extension host will treat null as "cannot safely edit" and must
	 * surface a fallback to the user instead of silently overwriting the file.
	 *
	 * Implementations should prefer using model.index when available; otherwise they
	 * can perform conservative anchored searches (id first, then tag+occurrence).
	 */
	abstract findAttributeRange?(model: DocumentModel, edit: AttributeEditDescriptor): Promise<ByteRange | null>;

	/**
	 * Utility: convert a ByteRange to a vscode.Range using the content string.
	 * Provided as a convenience; concrete implementations may also reimplement if needed.
	 */
	byteRangeToVscodeRange(content: string, range: ByteRange): vscode.Range {
		const startPos = this.offsetToPosition(content, range.start);
		const endPos = this.offsetToPosition(content, range.end);
		return new vscode.Range(startPos, endPos);
	}

	/**
	 * Utility: convert offset to vscode.Position (line/character).
	 * This method assumes '\n' as line separator when counting lines and is consistent
	 * with how VS Code computes positions from document text.
	 */
	protected offsetToPosition(content: string, offset: number): vscode.Position {
		if (offset <= 0) return new vscode.Position(0, 0);
		let line = 0;
		let lastLineStart = 0;
		for (let i = 0; i < offset && i < content.length; i++) {
			if (content.charCodeAt(i) === 10) { // '\n'
				line++;
				lastLineStart = i + 1;
			}
		}
		const char = offset - lastLineStart;
		return new vscode.Position(line, char);
	}
}
