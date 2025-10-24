// ARCHIVE REMOVED: original file contents were deleted per user request.

export { };
import * as vscode from 'vscode';
import { CustomXmlDocument } from './customXmlDocument';
import { XmlSerializer } from './xmlSerializer';
import { XMLSerializer } from 'xmldom';

export class XmlEditorProvider implements vscode.CustomEditorProvider<CustomXmlDocument> {

	public static register(context: vscode.ExtensionContext): vscode.Disposable {
		const provider = new XmlEditorProvider(context);
		return vscode.window.registerCustomEditorProvider('xml.editor', provider, {
			webviewOptions: {
				retainContextWhenHidden: true,
			},
			supportsMultipleEditorsPerDocument: false,
		});
	}

	private readonly serializer: XmlSerializer;

	constructor(private readonly context: vscode.ExtensionContext) {
		this.serializer = new XmlSerializer();
	}

	async openCustomDocument(
		uri: vscode.Uri,
		openContext: { backupId?: string },
		_token: vscode.CancellationToken
	): Promise<CustomXmlDocument> {
		const content = openContext.backupId ? await vscode.workspace.fs.readFile(vscode.Uri.parse(openContext.backupId)) : await vscode.workspace.fs.readFile(uri);
		const document = await this.serializer.deserialize(content);
		// We need to replace the placeholder URI from the serializer with the actual URI.
		document.uri = uri;
		return document;
	}

	async resolveCustomEditor(
		document: CustomXmlDocument,
		webviewPanel: vscode.WebviewPanel,
		_token: vscode.CancellationToken
	): Promise<void> {
		// Setup the webview
		webviewPanel.webview.options = {
			enableScripts: true,
		};

		// Initial render
		this.updateWebview(document, webviewPanel);

		// Listen for changes to the document from the extension's logic
		const changeSubscription = document.onDidEdit(() => {
			this.updateWebview(document, webviewPanel);
		});

		// Clean up disposables
		webviewPanel.onDidDispose(() => {
			changeSubscription.dispose();
		});
	}

	private updateWebview(document: CustomXmlDocument, webviewPanel: vscode.WebviewPanel) {
		const serializer = new XMLSerializer();
		const xmlString = serializer.serializeToString(document.dom);

		webviewPanel.webview.html = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>XML Editor</title>
            </head>
            <body>
                <h1>XML Content</h1>
                <pre>${xmlString.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
            </body>
            </html>
        `;
	}

	public async saveCustomDocument(document: CustomXmlDocument, cancellation: vscode.CancellationToken): Promise<void> {
		const fileData = await this.serializer.serialize(document);
		await vscode.workspace.fs.writeFile(document.uri, fileData);
	}

	public async saveCustomDocumentAs(document: CustomXmlDocument, destination: vscode.Uri, cancellation: vscode.CancellationToken): Promise<void> {
		const fileData = await this.serializer.serialize(document);
		await vscode.workspace.fs.writeFile(destination, fileData);
	}

	public async revertCustomDocument(document: CustomXmlDocument, cancellation: vscode.CancellationToken): Promise<void> {
		const fileData = await vscode.workspace.fs.readFile(document.uri);
		const newDocument = await this.serializer.deserialize(fileData);
		document.applyEdit(newDocument.dom);
	}

	public async backupCustomDocument(document: CustomXmlDocument, context: vscode.CustomDocumentBackupContext, cancellation: vscode.CancellationToken): Promise<vscode.CustomDocumentBackup> {
		const fileData = await this.serializer.serialize(document);
		await vscode.workspace.fs.writeFile(context.destination, fileData);
		return {
			id: context.destination.toString(),
			delete: async () => {
				try {
					await vscode.workspace.fs.delete(context.destination);
				} catch {
					// no-op
				}
			}
		};
	}
}
