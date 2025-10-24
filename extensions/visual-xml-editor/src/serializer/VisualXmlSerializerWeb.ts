/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VisualXmlSerializerBase, DocumentModel } from './VisualXmlSerializerBase';

export class VisualXmlSerializerWeb extends VisualXmlSerializerBase {
	deserialize(content: string): DocumentModel {
		const parser = new DOMParser();
		const xmlDoc = parser.parseFromString(content, "text/xml");
		// For now, we'll just re-serialize the parsed document to demonstrate the concept.
		// A more complete implementation would involve creating a richer DocumentModel.
		const newContent = new XMLSerializer().serializeToString(xmlDoc);
		return { content: newContent };
	}

	serialize(model: DocumentModel): string {
		// For now, we assume the content is already a valid XML string.
		// A more complete implementation would serialize a richer DocumentModel.
		return model.content;
	}
}
