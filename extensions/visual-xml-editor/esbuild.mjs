/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// esbuild.mjs
// @ts-check
import path from 'node:path';
import { run } from '../esbuild-webview-common.mjs';

const srcDir = path.join(import.meta.dirname, 'src');
const outDir = path.join(import.meta.dirname, 'media');

run({
	entryPoints: [
		path.join(srcDir, 'webview.ts'),
		path.join(srcDir, 'preview-webview.ts'),
	],
	srcDir,
	outdir: outDir,
	// Produce easy-to-use source maps for debugging in the webview/devtools
	// Use "inline" during development so the map is embedded and DevTools picks up original TS directly
	// Keep output readable by disabling minification and preserving names
	sourcemap: 'inline',
	minify: false,
	bundle: true,
	format: 'iife',
	keepNames: true,
	sourceRoot: '../../src',
}, process.argv);
