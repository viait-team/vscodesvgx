/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationError } from 'vscode';

/**
 * Copied-local helpers: DeferredPromise and generateUuid. Kept intentionally small and
 * independent so the worker pattern can be implemented here without cross-extension
 * dependencies.
 */
export function generateUuid(): string {
	if (typeof crypto !== 'undefined' && typeof (crypto as any).randomUUID === 'function') {
		return (crypto as any).randomUUID();
	}

	const _data = new Uint8Array(16);
	const _hex: string[] = [];
	for (let i = 0; i < 256; i++) {
		_hex.push(i.toString(16).padStart(2, '0'));
	}
	crypto.getRandomValues(_data);
	_data[6] = (_data[6] & 0x0f) | 0x40;
	_data[8] = (_data[8] & 0x3f) | 0x80;
	let i = 0;
	let result = '';
	result += _hex[_data[i++]];
	result += _hex[_data[i++]];
	result += _hex[_data[i++]];
	result += _hex[_data[i++]];
	result += '-';
	result += _hex[_data[i++]];
	result += _hex[_data[i++]];
	result += '-';
	result += _hex[_data[i++]];
	result += _hex[_data[i++]];
	result += '-';
	result += _hex[_data[i++]];
	result += _hex[_data[i++]];
	result += '-';
	result += _hex[_data[i++]];
	result += _hex[_data[i++]];
	result += _hex[_data[i++]];
	result += _hex[_data[i++]];
	result += _hex[_data[i++]];
	result += _hex[_data[i++]];
	return result;
}

export type ValueCallback<T = unknown> = (value: T | Promise<T>) => void;

export class DeferredPromise<T> {
	private completeCallback!: ValueCallback<T>;
	private errorCallback!: (err: unknown) => void;
	public readonly p: Promise<T>;

	constructor() {
		this.p = new Promise<T>((c, e) => {
			this.completeCallback = c;
			this.errorCallback = e;
		});
	}

	public complete(value: T) {
		return new Promise<void>((resolve) => {
			this.completeCallback(value);
			resolve();
		});
	}

	public error(err: unknown) {
		return new Promise<void>((resolve) => {
			this.errorCallback(err);
			resolve();
		});
	}

	public cancel() {
		return this.error(new CancellationError());
	}
}
