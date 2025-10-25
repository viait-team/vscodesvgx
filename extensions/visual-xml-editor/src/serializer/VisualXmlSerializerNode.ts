import { XMLParser, XMLBuilder } from 'fast-xml-parser';
import { VisualXmlSerializerBase, DocumentModel } from './VisualXmlSerializerBase';

export class VisualXmlSerializerNode extends VisualXmlSerializerBase {
	deserialize(content: string): DocumentModel {
		const parser = new XMLParser();
		const jsonObj = parser.parse(content);
		// For now, we'll just re-serialize the parsed document to demonstrate the concept.
		// A more complete implementation would involve creating a richer DocumentModel.
		const builder = new XMLBuilder({});
		const newContent = builder.build(jsonObj);
		return { content: newContent };
	}

	serialize(model: DocumentModel): string {
		// For now, we assume the content is already a valid XML string.
		// A more complete implementation would serialize a richer DocumentModel.
		return model.content;
	}
}
