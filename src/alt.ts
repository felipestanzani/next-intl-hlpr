import * as vscode from 'vscode';
import * as jsonc from 'jsonc-parser';
import {I18nAnalyzer} from './i18nAnalyzer';
import {minimatch} from 'minimatch';

let diagnosticCollection: vscode.DiagnosticCollection;
const analyzer = new I18nAnalyzer();

export function activate(context: vscode.ExtensionContext) {
  diagnosticCollection = vscode.languages.createDiagnosticCollection('i18n');
  context.subscriptions.push(diagnosticCollection);

  const updateDiagnostics = async (document: vscode.TextDocument) => {
    const config = vscode.workspace.getConfiguration('i18n-compare');
    const pattern = config.get<string>('filePattern', '**/i18n/*.json');

    // Use minimatch to check if the document is one of our target files
    if (minimatch(document.uri.fsPath, pattern)) {
      const diagnostics = await analyzer.analyze(document);
      diagnosticCollection.set(document.uri, diagnostics);
    }
  };

  // Initial check for active editor
  if (vscode.window.activeTextEditor) {
    updateDiagnostics(vscode.window.activeTextEditor.document);
  }

  // Update on opening a new file
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(updateDiagnostics)
  );

  // Update on file changes (while typing)
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) =>
      updateDiagnostics(event.document)
    )
  );

  // Clear diagnostics when a file is closed
  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument((doc) =>
      diagnosticCollection.delete(doc.uri)
    )
  );
}
