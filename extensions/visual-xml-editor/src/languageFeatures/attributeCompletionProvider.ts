/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Attribute definitions for two-column name-value pair editor
 * Provides structured data for dropdown selections in the webview attribute editor
 */

export interface AttributeDefinition {
	name: string;
	description: string;
	valueType: 'select' | 'text' | 'color' | 'number' | 'length';
	defaultValue?: string;
	allowedValues?: string[];
	validation?: (value: string) => boolean;
}

export interface ElementAttributeSpec {
	elementName: string;
	attributes: AttributeDefinition[];
}

/**
 * SVG/XML Attribute Registry for Name-Value Pair Editor
 * This provides the data structure needed for two-column attribute editing
 */
export class SVGAttributeRegistry {

	/**
	 * Font family options for dropdown selection
	 */
	static readonly FONT_FAMILY_OPTIONS = [
		'Arial', 'Helvetica', 'Times New Roman', 'Times', 'Georgia', 'Verdana',
		'Courier New', 'Monaco', 'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy'
	];

	/**
	 * Color options for dropdown selection
	 */
	static readonly COLOR_OPTIONS = [
		'red', 'green', 'blue', 'yellow', 'orange', 'purple', 'pink',
		'brown', 'gray', 'black', 'white', 'cyan', 'magenta',
		'none', 'transparent', 'currentColor'
	];

	/**
	 * Font size options for dropdown selection
	 */
	static readonly FONT_SIZE_OPTIONS = [
		'8px', '10px', '12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px', '36px', '48px',
		'xx-small', 'x-small', 'small', 'medium', 'large', 'x-large', 'xx-large'
	];

	/**
	 * Font weight options for dropdown selection
	 */
	static readonly FONT_WEIGHT_OPTIONS = [
		'normal', 'bold', 'bolder', 'lighter',
		'100', '200', '300', '400', '500', '600', '700', '800', '900'
	];

	/**
	 * Text anchor options for dropdown selection
	 */
	static readonly TEXT_ANCHOR_OPTIONS = [
		'start', 'middle', 'end'
	];

	/**
	 * Stroke line cap options for dropdown selection
	 */
	static readonly STROKE_LINECAP_OPTIONS = [
		'butt', 'round', 'square'
	];

	/**
	 * Stroke line join options for dropdown selection
	 */
	static readonly STROKE_LINEJOIN_OPTIONS = [
		'miter', 'round', 'bevel'
	];

	/**
	 * Get all available attributes for a specific SVG element
	 */
	static getAttributesForElement(elementName: string): AttributeDefinition[] {
		const elementLower = elementName.toLowerCase();

		// Common attributes available for all elements
		const commonAttributes: AttributeDefinition[] = [
			{
				name: 'id',
				description: 'Unique identifier for the element',
				valueType: 'text'
			},
			{
				name: 'class',
				description: 'CSS class name(s) for styling',
				valueType: 'text'
			},
			{
				name: 'style',
				description: 'Inline CSS styles',
				valueType: 'text'
			},
			{
				name: 'opacity',
				description: 'Sets the opacity of the element',
				valueType: 'number',
				defaultValue: '1'
			}
		];

		// Element-specific attributes
		const elementSpecificAttributes: Record<string, AttributeDefinition[]> = {
			text: [
				{
					name: 'font-family',
					description: 'Specifies the font family for text rendering',
					valueType: 'select',
					allowedValues: this.FONT_FAMILY_OPTIONS,
					defaultValue: 'Arial'
				},
				{
					name: 'font-size',
					description: 'Sets the size of the font',
					valueType: 'select',
					allowedValues: this.FONT_SIZE_OPTIONS,
					defaultValue: '16px'
				},
				{
					name: 'font-weight',
					description: 'Sets the weight (boldness) of the font',
					valueType: 'select',
					allowedValues: this.FONT_WEIGHT_OPTIONS,
					defaultValue: 'normal'
				},
				{
					name: 'text-anchor',
					description: 'Sets the horizontal text alignment',
					valueType: 'select',
					allowedValues: this.TEXT_ANCHOR_OPTIONS,
					defaultValue: 'start'
				},
				{
					name: 'fill',
					description: 'Sets the fill color of the text',
					valueType: 'select',
					allowedValues: this.COLOR_OPTIONS,
					defaultValue: 'black'
				},
				{
					name: 'x',
					description: 'X coordinate of the text',
					valueType: 'number',
					defaultValue: '0'
				},
				{
					name: 'y',
					description: 'Y coordinate of the text',
					valueType: 'number',
					defaultValue: '0'
				}
			],
			circle: [
				{
					name: 'cx',
					description: 'Center X coordinate',
					valueType: 'number',
					defaultValue: '50'
				},
				{
					name: 'cy',
					description: 'Center Y coordinate',
					valueType: 'number',
					defaultValue: '50'
				},
				{
					name: 'r',
					description: 'Radius of the circle',
					valueType: 'number',
					defaultValue: '25'
				},
				{
					name: 'fill',
					description: 'Fill color of the circle',
					valueType: 'select',
					allowedValues: this.COLOR_OPTIONS,
					defaultValue: 'blue'
				},
				{
					name: 'stroke',
					description: 'Stroke color of the circle',
					valueType: 'select',
					allowedValues: this.COLOR_OPTIONS,
					defaultValue: 'none'
				},
				{
					name: 'stroke-width',
					description: 'Width of the stroke',
					valueType: 'number',
					defaultValue: '1'
				}
			],
			rect: [
				{
					name: 'x',
					description: 'X coordinate of the rectangle',
					valueType: 'number',
					defaultValue: '0'
				},
				{
					name: 'y',
					description: 'Y coordinate of the rectangle',
					valueType: 'number',
					defaultValue: '0'
				},
				{
					name: 'width',
					description: 'Width of the rectangle',
					valueType: 'number',
					defaultValue: '100'
				},
				{
					name: 'height',
					description: 'Height of the rectangle',
					valueType: 'number',
					defaultValue: '50'
				},
				{
					name: 'fill',
					description: 'Fill color of the rectangle',
					valueType: 'select',
					allowedValues: this.COLOR_OPTIONS,
					defaultValue: 'red'
				},
				{
					name: 'stroke',
					description: 'Stroke color of the rectangle',
					valueType: 'select',
					allowedValues: this.COLOR_OPTIONS,
					defaultValue: 'none'
				},
				{
					name: 'rx',
					description: 'X-axis radius for rounded corners',
					valueType: 'number',
					defaultValue: '0'
				},
				{
					name: 'ry',
					description: 'Y-axis radius for rounded corners',
					valueType: 'number',
					defaultValue: '0'
				}
			],
			path: [
				{
					name: 'd',
					description: 'Path data (SVG path commands)',
					valueType: 'text'
				},
				{
					name: 'fill',
					description: 'Fill color of the path',
					valueType: 'select',
					allowedValues: this.COLOR_OPTIONS,
					defaultValue: 'none'
				},
				{
					name: 'stroke',
					description: 'Stroke color of the path',
					valueType: 'select',
					allowedValues: this.COLOR_OPTIONS,
					defaultValue: 'black'
				},
				{
					name: 'stroke-width',
					description: 'Width of the stroke',
					valueType: 'number',
					defaultValue: '1'
				},
				{
					name: 'stroke-linecap',
					description: 'Shape of stroke line caps',
					valueType: 'select',
					allowedValues: this.STROKE_LINECAP_OPTIONS,
					defaultValue: 'butt'
				},
				{
					name: 'stroke-linejoin',
					description: 'Shape of stroke line joins',
					valueType: 'select',
					allowedValues: this.STROKE_LINEJOIN_OPTIONS,
					defaultValue: 'miter'
				}
			],
			line: [
				{
					name: 'x1',
					description: 'Start X coordinate',
					valueType: 'number',
					defaultValue: '0'
				},
				{
					name: 'y1',
					description: 'Start Y coordinate',
					valueType: 'number',
					defaultValue: '0'
				},
				{
					name: 'x2',
					description: 'End X coordinate',
					valueType: 'number',
					defaultValue: '100'
				},
				{
					name: 'y2',
					description: 'End Y coordinate',
					valueType: 'number',
					defaultValue: '100'
				},
				{
					name: 'stroke',
					description: 'Stroke color of the line',
					valueType: 'select',
					allowedValues: this.COLOR_OPTIONS,
					defaultValue: 'black'
				},
				{
					name: 'stroke-width',
					description: 'Width of the stroke',
					valueType: 'number',
					defaultValue: '1'
				}
			]
		};

		const specific = elementSpecificAttributes[elementLower] || [];
		return [...commonAttributes, ...specific];
	}

	/**
	 * Get allowed values for a specific attribute
	 */
	static getAllowedValuesForAttribute(attributeName: string): string[] | null {
		const attrLower = attributeName.toLowerCase();

		switch (attrLower) {
			case 'font-family':
				return this.FONT_FAMILY_OPTIONS;
			case 'font-size':
				return this.FONT_SIZE_OPTIONS;
			case 'font-weight':
				return this.FONT_WEIGHT_OPTIONS;
			case 'text-anchor':
				return this.TEXT_ANCHOR_OPTIONS;
			case 'fill':
			case 'stroke':
				return this.COLOR_OPTIONS;
			case 'stroke-linecap':
				return this.STROKE_LINECAP_OPTIONS;
			case 'stroke-linejoin':
				return this.STROKE_LINEJOIN_OPTIONS;
			default:
				return null;
		}
	}

	/**
	 * Validate an attribute value
	 */
	static validateAttributeValue(attributeName: string, value: string): boolean {
		const allowedValues = this.getAllowedValuesForAttribute(attributeName);

		if (allowedValues) {
			return allowedValues.includes(value);
		}

		// For numeric attributes, validate as number
		const numericAttributes = ['x', 'y', 'cx', 'cy', 'r', 'rx', 'ry', 'width', 'height', 'x1', 'y1', 'x2', 'y2', 'stroke-width', 'opacity'];
		if (numericAttributes.includes(attributeName.toLowerCase())) {
			return !isNaN(parseFloat(value));
		}

		// For text attributes, allow any value
		return true;
	}
}

/**
 * Export the registry data for use in webview attribute editor
 */
export function getAttributeRegistry() {
	return SVGAttributeRegistry;
}
