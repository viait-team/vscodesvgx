/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VisualXmlSerializerBase, DocumentModel } from './VisualXmlSerializerBase';

export class VisualXmlSerializerNode extends VisualXmlSerializerBase {
	deserialize(content: string): DocumentModel {
		// For now, the model is a thin wrapper around raw content.
		return { content };
	}

	serialize(model: DocumentModel): string {
		// Identity serialization until richer model is implemented.
		return model.content;
	}
}
