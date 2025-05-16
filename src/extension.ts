import * as vscode from 'vscode';
import {Logger} from './utils/logger';
import {ConfigService} from './services/configService';
import {TranslationService} from './services/translationService';
import {DiagnosticService} from './services/diagnosticService';
import {HoverProvider} from './providers/hoverProvider';

// Activate the extension
export async function activate(context: vscode.ExtensionContext) {
  const logger = new Logger();
  logger.log('Activating next-intl-hlpr extension');

  const configService = new ConfigService(logger);
  const translationService = new TranslationService(logger, configService);
  const diagnosticService = new DiagnosticService(
    logger,
    translationService,
    configService
  );

  // Initialize services
  await translationService.initialize();
  await diagnosticService.setupFileWatcher();

  // Register hover provider
  const hoverProvider = new HoverProvider(translationService);
  context.subscriptions.push(
    vscode.languages.registerHoverProvider('json', hoverProvider)
  );

  // Set up file watchers
  const fileWatcher = vscode.workspace.createFileSystemWatcher(
    '**/*.json',
    false,
    false,
    false
  );

  fileWatcher.onDidChange(async (uri) => {
    const document = await vscode.workspace.openTextDocument(uri);
    await diagnosticService.updateDiagnostics(document);
  });

  fileWatcher.onDidCreate(async (uri) => {
    const document = await vscode.workspace.openTextDocument(uri);
    // Reinitialize translation service to include the new language
    await translationService.initialize();
    await diagnosticService.updateDiagnostics(document);
  });

  fileWatcher.onDidDelete((uri) => {
    diagnosticService.clearDiagnostics(uri);
  });

  // Set up configuration change handler
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (event) => {
      if (event.affectsConfiguration('nextIntlHlpr')) {
        configService.clearCache();
        await translationService.initialize();
        // Update diagnostics for all open JSON documents
        const documents = vscode.workspace.textDocuments.filter(
          (doc) => doc.languageId === 'json'
        );
        for (const document of documents) {
          await diagnosticService.updateDiagnostics(document);
        }
      }
    })
  );

  // Initial diagnostics for open documents
  const documents = vscode.workspace.textDocuments.filter(
    (doc) => doc.languageId === 'json'
  );
  for (const document of documents) {
    await diagnosticService.updateDiagnostics(document);
  }

  context.subscriptions.push(
    fileWatcher,
    diagnosticService,
    translationService
  );

  logger.log('next-intl-hlpr activation completed');
}

// Deactivate the extension
export function deactivate() {
  // Cleanup is handled by VS Code's subscription disposal
}
