import * as vscode from 'vscode';
import * as path from 'path';
import {Logger} from '../utils/logger';
import {TranslationService} from './translationService';
import {ConfigService} from './configService';

export class DiagnosticService {
  private readonly diagnosticCollection: vscode.DiagnosticCollection;
  private fileWatcher: vscode.FileSystemWatcher | undefined;

  constructor(
    private readonly logger: Logger,
    private readonly translationService: TranslationService,
    private readonly configService: ConfigService
  ) {
    this.diagnosticCollection =
      vscode.languages.createDiagnosticCollection('next-intl-hlpr');
    this.setupFileWatcher();
  }

  private async setupFileWatcher(): Promise<void> {
    // Dispose existing watcher if any
    if (this.fileWatcher) {
      this.fileWatcher.dispose();
    }

    // Create new watcher for all JSON files in the messages directory
    const config = await this.configService.getNextIntlConfig();
    if (!config) {
      return;
    }

    const messagesDir = path.dirname(config.requestPath);
    const pattern = new vscode.RelativePattern(
      vscode.workspace.getWorkspaceFolder(vscode.Uri.file(messagesDir))!,
      'messages/*.json'
    );

    this.fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);

    this.fileWatcher.onDidChange(async (uri) => {
      this.logger.log(`Translation file changed: ${uri.fsPath}`);
      await this.translationService.reloadTranslations();
      await this.updateDiagnostics(
        await vscode.workspace.openTextDocument(uri)
      );
    });

    this.fileWatcher.onDidCreate(async (uri) => {
      this.logger.log(`New translation file created: ${uri.fsPath}`);
      await this.translationService.reloadTranslations();
      await this.updateDiagnostics(
        await vscode.workspace.openTextDocument(uri)
      );
    });

    this.fileWatcher.onDidDelete(async (uri) => {
      this.logger.log(`Translation file deleted: ${uri.fsPath}`);
      await this.translationService.reloadTranslations();
      this.clearDiagnostics(uri);
    });
  }

  async updateDiagnostics(document: vscode.TextDocument): Promise<void> {
    if (document.languageId !== 'json') {
      return;
    }

    this.logger.log(`Updating diagnostics for: ${document.uri.fsPath}`);

    try {
      const config = await this.configService.getNextIntlConfig();
      if (!config) {
        return;
      }

      // Update diagnostics for all translation files
      for (const locale of config.locales) {
        const filePath = path.join(
          path.dirname(document.uri.fsPath),
          `${locale}.json`
        );
        const uri = vscode.Uri.file(filePath);

        try {
          const doc = await vscode.workspace.openTextDocument(uri);
          await this.updateFileDiagnostics(doc);
        } catch (error) {
          // File might not exist yet, that's okay
          this.logger.log(`Could not open file ${filePath}: ${error}`);
        }
      }
    } catch (error) {
      this.logger.log('Error updating diagnostics', error);
    }
  }

  private async updateFileDiagnostics(
    document: vscode.TextDocument
  ): Promise<void> {
    let diagnostics: vscode.Diagnostic[] = [];
    const currentLocale = this.getCurrentLocale(document.uri.fsPath);

    if (!currentLocale) {
      return;
    }

    // Get all translations
    const allTranslations = this.translationService.getAllTranslations();
    const currentTranslation = allTranslations.find(
      (t) => t.locale === currentLocale
    );

    if (!currentTranslation) {
      return;
    }

    // Parse the current file's content to get the structure
    const currentContent = JSON.parse(document.getText());
    const currentKeys = this.getAllKeys(currentContent);

    // Group missing nested keys by parent key and locale
    const missingNestedKeysByParent = new Map<
      string,
      Map<string, Set<string>>
    >();
    // Group missing translations by key and locale
    const missingTranslationsByKey = new Map<string, Set<string>>();

    // Check each translation file
    for (const translation of allTranslations) {
      if (translation.locale === currentLocale) {
        continue;
      }

      // Check for keys that exist in other locales but not in current
      for (const [key] of translation.messages) {
        if (!currentTranslation.messages.has(key)) {
          if (!missingTranslationsByKey.has(key)) {
            missingTranslationsByKey.set(key, new Set());
          }
          missingTranslationsByKey.get(key)!.add(translation.locale);
        }
      }

      // Check for keys that exist in current but not in other locales
      for (const [key] of currentTranslation.messages) {
        if (!translation.messages.has(key)) {
          if (!missingTranslationsByKey.has(key)) {
            missingTranslationsByKey.set(key, new Set());
          }
          missingTranslationsByKey.get(key)!.add(translation.locale);
        }
      }

      // Check for missing nested keys within the same parent key
      const otherFilePath = path.join(
        path.dirname(document.uri.fsPath),
        `${translation.locale}.json`
      );
      const otherContent = JSON.parse(
        Buffer.from(
          await vscode.workspace.fs.readFile(vscode.Uri.file(otherFilePath))
        ).toString()
      );
      const otherKeys = this.getAllKeys(otherContent);

      // Group keys by their parent key
      const currentParentKeys = new Map<string, Set<string>>();
      const otherParentKeys = new Map<string, Set<string>>();

      for (const key of currentKeys) {
        const keyParts = key.split('.');
        if (keyParts.length > 1) {
          const parentKey = keyParts[0];
          if (!currentParentKeys.has(parentKey)) {
            currentParentKeys.set(parentKey, new Set());
          }
          currentParentKeys.get(parentKey)!.add(key);
        }
      }

      for (const key of otherKeys) {
        const keyParts = key.split('.');
        if (keyParts.length > 1) {
          const parentKey = keyParts[0];
          if (!otherParentKeys.has(parentKey)) {
            otherParentKeys.set(parentKey, new Set());
          }
          otherParentKeys.get(parentKey)!.add(key);
        }
      }

      // Check for missing nested keys in each parent key
      for (const [parentKey, otherNestedKeys] of otherParentKeys) {
        const currentNestedKeys = currentParentKeys.get(parentKey) || new Set();
        const missingNestedKeys = new Set<string>();

        for (const nestedKey of otherNestedKeys) {
          if (!currentNestedKeys.has(nestedKey)) {
            missingNestedKeys.add(nestedKey);
          }
        }

        if (missingNestedKeys.size > 0) {
          if (!missingNestedKeysByParent.has(parentKey)) {
            missingNestedKeysByParent.set(parentKey, new Map());
          }
          missingNestedKeysByParent
            .get(parentKey)!
            .set(translation.locale, missingNestedKeys);
        }
      }
    }

    // Create diagnostics for each parent key with all missing nested keys
    for (const [parentKey, localeKeys] of missingNestedKeysByParent) {
      const range = this.findKeyRange(document, parentKey);
      if (range) {
        const message = this.createMissingNestedKeysMessage(
          parentKey,
          localeKeys
        );
        const diagnostic = new vscode.Diagnostic(
          range,
          message,
          vscode.DiagnosticSeverity.Warning
        );
        diagnostic.source = 'next-intl-hlpr';
        diagnostics.push(diagnostic);
      }
    }

    // Create diagnostics for missing translations
    for (const [key, missingLocales] of missingTranslationsByKey) {
      const range = this.findKeyRange(document, key);
      if (range) {
        const message = this.createMissingTranslationMessage(
          key,
          missingLocales
        );
        const diagnostic = new vscode.Diagnostic(
          range,
          message,
          vscode.DiagnosticSeverity.Warning
        );
        diagnostic.source = 'next-intl-hlpr';
        diagnostics.push(diagnostic);
      }
    }

    // Check for missing translations within the same language file
    for (const key of currentKeys) {
      const keyParts = key.split('.');
      if (keyParts.length > 1) {
        const parentKey = keyParts.slice(0, -1).join('.');
        if (!currentKeys.includes(parentKey)) {
          const range = this.findKeyRange(document, key);
          if (range) {
            const diagnostic = this.createMissingParentTranslationDiagnostic(
              range,
              key,
              parentKey
            );
            diagnostics.push(diagnostic);
          }
        }
      }
    }

    this.logger.log(
      `Found ${diagnostics.length} missing translations in ${currentLocale}`
    );
    this.diagnosticCollection.set(document.uri, diagnostics);
  }

  private getAllKeys(obj: any, prefix = ''): string[] {
    let keys: string[] = [];
    for (const key in obj) {
      const newKey = prefix ? `${prefix}.${key}` : key;
      keys.push(newKey);
      if (typeof obj[key] === 'object' && obj[key] !== null) {
        keys = keys.concat(this.getAllKeys(obj[key], newKey));
      }
    }
    return keys;
  }

  private createMissingParentTranslationDiagnostic(
    range: vscode.Range,
    key: string,
    parentKey: string
  ): vscode.Diagnostic {
    const message = `Missing parent translation "${parentKey}" for key "${key}"`;
    const diagnostic = new vscode.Diagnostic(
      range,
      message,
      vscode.DiagnosticSeverity.Warning
    );
    diagnostic.source = 'next-intl-hlpr';
    return diagnostic;
  }

  private getCurrentLocale(filePath: string): string | undefined {
    const fileName = path.basename(filePath);
    const match = fileName.match(/([a-z]{2})\.json$/);
    return match ? match[1] : undefined;
  }

  private findKeyRange(
    document: vscode.TextDocument,
    key: string
  ): vscode.Range | undefined {
    const text = document.getText();
    const keyParts = key.split('.');
    const lastKey = keyParts[keyParts.length - 1];

    // Create a pattern that matches the last part of the key
    const keyPattern = new RegExp(`"${lastKey}"\\s*:`, 'g');
    let match: RegExpExecArray | null;

    while ((match = keyPattern.exec(text)) !== null) {
      const startPos = document.positionAt(match.index);
      const endPos = document.positionAt(match.index + match[0].length);
      return new vscode.Range(startPos, endPos);
    }

    return undefined;
  }

  private createMissingTranslationMessage(
    key: string,
    missingLocales: Set<string>
  ): string {
    return `Missing translations for key "${key}" in:\n${Array.from(missingLocales).join(', ')}`;
  }

  private createMissingNestedKeysMessage(
    parentKey: string,
    localeKeys: Map<string, Set<string>>
  ): string {
    const lines = [`Missing nested translations in "${parentKey}":`];
    for (const [locale, keys] of localeKeys) {
      lines.push(`${locale} - ${Array.from(keys).join(', ')}`);
    }
    return lines.join('\n');
  }

  private createMissingNestedKeysDiagnostic(
    range: vscode.Range,
    parentKey: string,
    missingKeys: string[],
    locale: string
  ): vscode.Diagnostic {
    const message = `Missing nested translations in "${parentKey}":\n${locale} - ${missingKeys.join(', ')}`;
    const diagnostic = new vscode.Diagnostic(
      range,
      message,
      vscode.DiagnosticSeverity.Warning
    );
    diagnostic.source = 'next-intl-hlpr';
    return diagnostic;
  }

  clearDiagnostics(uri: vscode.Uri): void {
    this.diagnosticCollection.delete(uri);
  }

  dispose(): void {
    if (this.fileWatcher) {
      this.fileWatcher.dispose();
    }
    this.diagnosticCollection.dispose();
  }
}
