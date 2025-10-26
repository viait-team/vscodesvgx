/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface DocumentModel {
	content: string;
}

export abstract class VisualXmlSerializerBase {
	/**
	 * Convert XML text into an in-memory document model.
	 */
	abstract deserialize(content: string): Promise<DocumentModel>;

	/**
	 * Convert the in-memory document model back into XML text.
	 */
	abstract serialize(model: DocumentModel): Promise<string>;
}
