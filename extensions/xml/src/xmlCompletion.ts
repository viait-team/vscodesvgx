/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

// Define comprehensive SVG attribute definitions
interface SVGAttributeDefinition {
	name: string;
	description: string;
	valueType: 'color' | 'length' | 'number' | 'string' | 'enum' | 'url';
	enumValues?: string[];
	defaultValue?: string;
	applicableElements?: string[];
}

const SVG_ATTRIBUTES: SVGAttributeDefinition[] = [
	// Font-related attributes
	{
		name: 'font-family',
		description: 'Specifies the font family for text rendering',
		valueType: 'enum',
		enumValues: [
			'Arial', 'Helvetica', 'Times New Roman', 'Times', 'Georgia', 'Verdana',
			'Courier New', 'Monaco', 'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy'
		],
		applicableElements: ['text', 'tspan', 'textPath']
	},
	{
		name: 'font-size',
		description: 'Sets the size of the font',
		valueType: 'enum',
		enumValues: ['xx-small', 'x-small', 'small', 'medium', 'large', 'x-large', 'xx-large', 'smaller', 'larger'],
		applicableElements: ['text', 'tspan', 'textPath']
	},
	{
		name: 'font-weight',
		description: 'Sets the weight (boldness) of the font',
		valueType: 'enum',
		enumValues: ['normal', 'bold', 'bolder', 'lighter', '100', '200', '300', '400', '500', '600', '700', '800', '900'],
		applicableElements: ['text', 'tspan', 'textPath']
	},
	{
		name: 'font-style',
		description: 'Sets the style of the font',
		valueType: 'enum',
		enumValues: ['normal', 'italic', 'oblique'],
		applicableElements: ['text', 'tspan', 'textPath']
	},
	{
		name: 'text-anchor',
		description: 'Sets the horizontal text alignment',
		valueType: 'enum',
		enumValues: ['start', 'middle', 'end'],
		applicableElements: ['text', 'tspan', 'textPath']
	},

	// Color attributes
	{
		name: 'fill',
		description: 'Sets the fill color of the element',
		valueType: 'color',
		enumValues: ['none', 'currentColor', 'transparent', 'red', 'green', 'blue', 'yellow', 'orange', 'purple', 'pink', 'brown', 'gray', 'black', 'white'],
		applicableElements: ['circle', 'rect', 'path', 'polygon', 'ellipse', 'text']
	},
	{
		name: 'stroke',
		description: 'Sets the stroke color of the element',
		valueType: 'color',
		enumValues: ['none', 'currentColor', 'transparent', 'red', 'green', 'blue', 'yellow', 'orange', 'purple', 'pink', 'brown', 'gray', 'black', 'white'],
		applicableElements: ['circle', 'rect', 'path', 'polygon', 'ellipse', 'line']
	},
	{
		name: 'stroke-width',
		description: 'Sets the width of the stroke',
		valueType: 'number',
		enumValues: ['0', '1', '2', '3', '4', '5', '10'],
		applicableElements: ['circle', 'rect', 'path', 'polygon', 'ellipse', 'line']
	},

	// Common attributes
	{
		name: 'id',
		description: 'Unique identifier for the element',
		valueType: 'string',
		applicableElements: [] // applies to all elements
	},
	{
		name: 'class',
		description: 'CSS class name(s) for styling',
		valueType: 'string',
		applicableElements: [] // applies to all elements
	},
	{
		name: 'opacity',
		description: 'Sets the opacity of the element',
		valueType: 'number',
		enumValues: ['0', '0.1', '0.2', '0.3', '0.4', '0.5', '0.6', '0.7', '0.8', '0.9', '1'],
		applicableElements: [] // applies to all elements
	},

	// Position and size attributes
	{
		name: 'x',
		description: 'X coordinate',
		valueType: 'length',
		applicableElements: ['rect', 'text', 'image', 'use']
	},
	{
		name: 'y',
		description: 'Y coordinate',
		valueType: 'length',
		applicableElements: ['rect', 'text', 'image', 'use']
	},
	{
		name: 'width',
		description: 'Width of the element',
		valueType: 'length',
		applicableElements: ['rect', 'image', 'svg', 'foreignObject']
	},
	{
		name: 'height',
		description: 'Height of the element',
		valueType: 'length',
		applicableElements: ['rect', 'image', 'svg', 'foreignObject']
	},
	{
		name: 'cx',
		description: 'Center X coordinate',
		valueType: 'length',
		applicableElements: ['circle', 'ellipse']
	},
	{
		name: 'cy',
		description: 'Center Y coordinate',
		valueType: 'length',
		applicableElements: ['circle', 'ellipse']
	},
	{
		name: 'r',
		description: 'Radius',
		valueType: 'length',
		applicableElements: ['circle']
	},
	{
		name: 'rx',
		description: 'X-axis radius',
		valueType: 'length',
		applicableElements: ['ellipse', 'rect']
	},
	{
		name: 'ry',
		description: 'Y-axis radius',
		valueType: 'length',
		applicableElements: ['ellipse', 'rect']
	},
];

interface ElementContext {
	name: string;
	attributes: Map<string, string>;
	position: vscode.Position;
}

interface AttributeContext {
	element: ElementContext;
	attributeName: string;
	isInValue: boolean;
	valueStartPosition?: vscode.Position;
	partialValue?: string;
}

export class SVGXMLCompletionProvider implements vscode.CompletionItemProvider {

	public readonly triggerCharacters = ['"', "'", '=', ' ', '<'];

	public async provideCompletionItems(
		document: vscode.TextDocument,
		position: vscode.Position,
		token: vscode.CancellationToken,
		context: vscode.CompletionContext
	): Promise<vscode.CompletionList | undefined> {

		// Parse the current XML/SVG context
		const xmlContext = this.parseXMLContext(document, position);
		if (!xmlContext) {
			return undefined;
		}

		const line = document.lineAt(position.line).text;
		const charAtPosition = line.charAt(position.character - 1);

		// Determine what type of completion to provide
		if (xmlContext.isInValue) {
			// We're inside an attribute value - provide value completions
			return this.provideAttributeValueCompletions(xmlContext);
		} else if (this.shouldProvideAttributeCompletions(document, position)) {
			// We're in a position to complete attribute names
			return this.provideAttributeNameCompletions(xmlContext.element);
		}

		return undefined;
	}

	private parseXMLContext(document: vscode.TextDocument, position: vscode.Position): AttributeContext | null {
		const line = document.lineAt(position.line).text;
		const beforeCursor = line.substring(0, position.character);

		// Find the current element
		const element = this.findCurrentElement(document, position);
		if (!element) {
			return null;
		}

		// Check if we're inside an attribute value
		const attributeValueMatch = beforeCursor.match(/(\w+(?:-\w+)*)\s*=\s*(['"])([^'"]*?)$/);
		if (attributeValueMatch) {
			return {
				element,
				attributeName: attributeValueMatch[1],
				isInValue: true,
				partialValue: attributeValueMatch[3]
			};
		}

		// Check if we're about to complete an attribute name
		const attributeNameMatch = beforeCursor.match(/\s+(\w*)$/);
		if (attributeNameMatch) {
			return {
				element,
				attributeName: attributeNameMatch[1],
				isInValue: false
			};
		}

		return null;
	}

	private findCurrentElement(document: vscode.TextDocument, position: vscode.Position): ElementContext | null {
		// Look backwards to find the opening tag
		let searchPos = position;
		let foundTag = false;
		let tagContent = '';

		for (let lineNum = position.line; lineNum >= 0 && !foundTag; lineNum--) {
			const line = document.lineAt(lineNum).text;
			const searchText = lineNum === position.line ?
				line.substring(0, position.character) : line;

			// Look for opening tag
			const openTagMatch = searchText.match(/<(\w+)([^>]*)$/);
			if (openTagMatch) {
				const elementName = openTagMatch[1];
				const attributeText = openTagMatch[2];

				// Parse existing attributes
				const attributes = new Map<string, string>();
				const attrMatches = attributeText.matchAll(/(\w+(?:-\w+)*)\s*=\s*(['"])([^'"]*)\2/g);
				for (const match of attrMatches) {
					attributes.set(match[1], match[3]);
				}

				return {
					name: elementName,
					attributes,
					position: new vscode.Position(lineNum, openTagMatch.index || 0)
				};
			}
		}

		return null;
	}

	private shouldProvideAttributeCompletions(document: vscode.TextDocument, position: vscode.Position): boolean {
		const line = document.lineAt(position.line).text;
		const beforeCursor = line.substring(0, position.character);

		// Check if we're in a context where attribute names make sense
		// After tag name, or after another attribute
		return /(?:<\w+\s+|[\w-]+\s*=\s*['"][^'"]*['"]\s+)\s*\w*$/.test(beforeCursor);
	}

	private provideAttributeNameCompletions(element: ElementContext): vscode.CompletionList {
		const completions: vscode.CompletionItem[] = [];

		// Filter attributes applicable to this element
		const applicableAttributes = SVG_ATTRIBUTES.filter(attr =>
			attr.applicableElements.length === 0 || // Universal attributes
			attr.applicableElements.includes(element.name.toLowerCase())
		);

		for (const attr of applicableAttributes) {
			// Skip if attribute already exists
			if (element.attributes.has(attr.name)) {
				continue;
			}

			const item = new vscode.CompletionItem(attr.name, vscode.CompletionItemKind.Property);
			item.detail = attr.description;
			item.insertText = `${attr.name}="$0"`;
			item.insertTextFormat = vscode.InsertTextFormat.Snippet;

			// Add documentation based on attribute type
			const docs = new vscode.MarkdownString(attr.description);
			if (attr.enumValues && attr.enumValues.length > 0) {
				docs.appendMarkdown(`\n\n**Allowed values:** ${attr.enumValues.slice(0, 8).join(', ')}${attr.enumValues.length > 8 ? '...' : ''}`);
			}
			item.documentation = docs;

			completions.push(item);
		}

		return new vscode.CompletionList(completions, false);
	}

	private provideAttributeValueCompletions(context: AttributeContext): vscode.CompletionList {
		const completions: vscode.CompletionItem[] = [];

		// Find the attribute definition
		const attrDef = SVG_ATTRIBUTES.find(attr =>
			attr.name === context.attributeName.toLowerCase()
		);

		if (!attrDef || !attrDef.enumValues) {
			return new vscode.CompletionList(completions, false);
		}

		// Create completion items for each enum value
		for (const value of attrDef.enumValues) {
			const item = new vscode.CompletionItem(value, this.getCompletionKind(attrDef.valueType));
			item.insertText = value;

			// Special handling for font-family to show preview
			if (context.attributeName === 'font-family') {
				item.documentation = new vscode.MarkdownString(`Font family: **${value}**`);
			}

			// Special handling for colors
			if (attrDef.valueType === 'color' && !['none', 'currentColor', 'transparent'].includes(value)) {
				item.documentation = new vscode.MarkdownString(`Color: ${value}`);
				// You could add color decorations here if VS Code supports it
			}

			completions.push(item);
		}

		return new vscode.CompletionList(completions, false);
	}

	private getCompletionKind(valueType: string): vscode.CompletionItemKind {
		switch (valueType) {
			case 'color': return vscode.CompletionItemKind.Color;
			case 'enum': return vscode.CompletionItemKind.EnumMember;
			case 'number': return vscode.CompletionItemKind.Value;
			case 'length': return vscode.CompletionItemKind.Unit;
			default: return vscode.CompletionItemKind.Value;
		}
	}
}

/**
 * Activate XML/SVG completion provider
 */
export function activate(context: vscode.ExtensionContext) {
	const provider = new SVGXMLCompletionProvider();

	// Register for XML and SVG files
	context.subscriptions.push(
		vscode.languages.registerCompletionItemProvider(
			[
				{ language: 'xml' },
				{ language: 'xml', pattern: '**/*.svg' },
				{ language: 'xml', pattern: '**/*.svgx' }
			],
			provider,
			...provider.triggerCharacters
		)
	);

	console.log('SVG/XML attribute completion provider activated');
}
