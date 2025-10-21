const path = require('path');

module.exports = [
	{
		entry: './src/extension.ts',
		target: 'node',
		output: {
			filename: 'extension.js',
			path: path.resolve(__dirname, 'dist'),
			libraryTarget: 'commonjs2',
			devtoolModuleFilenameTemplate: '../[resource-path]'
		},
		externals: {
			vscode: 'commonjs vscode'
		},
		resolve: {
			extensions: ['.ts', '.js']
		},
		module: {
			rules: [
				{
					test: /\.ts$/,
					exclude: /node_modules/,
					use: 'ts-loader'
				}
			]
		}
	},
	{
		entry: './src/extension.ts',
		target: 'webworker',
		output: {
			filename: 'extension.js',
			path: path.resolve(__dirname, 'dist', 'web'),
			libraryTarget: 'commonjs2',
			devtoolModuleFilenameTemplate: '../[resource-path]'
		},
		externals: {
			vscode: 'commonjs vscode'
		},
		resolve: {
			extensions: ['.ts', '.js']
		},
		module: {
			rules: [
				{
					test: /\.ts$/,
					exclude: /node_modules/,
					use: 'ts-loader'
				}
			]
		}
	}
];
