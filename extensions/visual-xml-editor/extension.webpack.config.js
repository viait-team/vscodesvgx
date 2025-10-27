/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const path = require('path');

/**
 * Basic webpack config to bundle the compiled extension entry into `dist/extension.js`.
 *
 * Notes:
 * - This is a minimal scaffold. It expects the TypeScript compile step to emit `out/extension.js` first.
 * - The build pipeline will detect this webpack config and, when used during packaging, will rewrite
 *   `package.json` main references from `/out/` to `/dist/` as needed.
 */
const config = {
	mode: 'production',
	target: 'node',
	// Ensure module resolution (entry) is resolved relative to the extension folder
	context: path.resolve(__dirname),
	entry: './out/extension.js',
	output: {
		path: path.resolve(__dirname, 'dist'),
		filename: 'extension.js',
		libraryTarget: 'commonjs2'
	},
	devtool: 'source-map',
	// keep vscode as external so it is provided by the host
	externals: {
		vscode: 'commonjs vscode'
	},
	node: {
		__dirname: false,
		__filename: false
	}
};

// Export as an object with a `default` property so `require(...).default` returns the config
// without mutating the config object (avoids adding a top-level `default` property to the config).
module.exports = { default: config };
module.exports.__esModule = true;
