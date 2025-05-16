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
  }

  async initialize(): Promise<void> {
    await this.setupFileWatcher();
  }

  public async setupFileWatcher(): Promise<void> {
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

      // Get all translations to determine available locales
      const allTranslations = this.translationService.getAllTranslations();
      const locales = allTranslations.map((t) => t.locale);

      // Update diagnostics for all translation files
      for (const locale of locales) {
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
    const currentLocale = this.getCurrentLocale(document.uri.fsPath);
    if (!currentLocale) return;

    const allTranslations = this.translationService.getAllTranslations();
    const currentTranslation = allTranslations.find(
      (t) => t.locale === currentLocale
    );
    if (!currentTranslation) return;

    const currentContent = JSON.parse(document.getText());
    const currentKeys = this.getAllKeys(currentContent);

    const {missingNestedKeysByParent, missingTranslationsByKey} =
      await this.analyzeMissingTranslations(
        currentLocale,
        currentTranslation,
        currentKeys,
        document
      );

    const diagnostics = this.createDiagnostics(
      document,
      missingNestedKeysByParent,
      missingTranslationsByKey,
      currentKeys
    );

    this.logger.log(
      `Found ${diagnostics.length} missing translations in ${currentLocale}`
    );
    this.diagnosticCollection.set(document.uri, diagnostics);
  }

  private async analyzeMissingTranslations(
    currentLocale: string,
    currentTranslation: any,
    currentKeys: string[],
    document: vscode.TextDocument
  ) {
    const missingNestedKeysByParent = new Map<
      string,
      Map<string, Set<string>>
    >();
    const missingTranslationsByKey = new Map<string, Set<string>>();
    const allTranslations = this.translationService.getAllTranslations();

    for (const translation of allTranslations) {
      if (translation.locale === currentLocale) continue;

      this.checkMissingTranslations(
        translation,
        currentTranslation,
        missingTranslationsByKey
      );

      await this.checkMissingNestedKeys(
        translation,
        currentKeys,
        document,
        missingNestedKeysByParent
      );
    }

    return {missingNestedKeysByParent, missingTranslationsByKey};
  }

  private checkMissingTranslations(
    translation: any,
    currentTranslation: any,
    missingTranslationsByKey: Map<string, Set<string>>
  ) {
    // Only check for missing translations in the current file's keys
    for (const [key] of currentTranslation.messages) {
      if (!translation.messages.has(key)) {
        this.addMissingTranslation(
          key,
          translation.locale,
          missingTranslationsByKey
        );
      }
    }
  }

  private addMissingTranslation(
    key: string,
    locale: string,
    missingTranslationsByKey: Map<string, Set<string>>
  ) {
    if (!missingTranslationsByKey.has(key)) {
      missingTranslationsByKey.set(key, new Set());
    }
    missingTranslationsByKey.get(key)!.add(locale);
  }

  private async checkMissingNestedKeys(
    translation: any,
    currentKeys: string[],
    document: vscode.TextDocument,
    missingNestedKeysByParent: Map<string, Map<string, Set<string>>>
  ) {
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

    const currentParentKeys = this.groupKeysByParent(currentKeys);
    const otherParentKeys = this.groupKeysByParent(otherKeys);

    this.compareParentKeys(
      otherParentKeys,
      currentParentKeys,
      translation.locale,
      missingNestedKeysByParent
    );
  }

  private groupKeysByParent(keys: string[]): Map<string, Set<string>> {
    const parentKeys = new Map<string, Set<string>>();
    for (const key of keys) {
      const keyParts = key.split('.');
      if (keyParts.length > 1) {
        const parentKey = keyParts[0];
        if (!parentKeys.has(parentKey)) {
          parentKeys.set(parentKey, new Set());
        }
        parentKeys.get(parentKey)!.add(key);
      }
    }
    return parentKeys;
  }

  private compareParentKeys(
    otherParentKeys: Map<string, Set<string>>,
    currentParentKeys: Map<string, Set<string>>,
    locale: string,
    missingNestedKeysByParent: Map<string, Map<string, Set<string>>>
  ) {
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
          .set(locale, missingNestedKeys);
      }
    }
  }

  private createDiagnostics(
    document: vscode.TextDocument,
    missingNestedKeysByParent: Map<string, Map<string, Set<string>>>,
    missingTranslationsByKey: Map<string, Set<string>>,
    currentKeys: string[]
  ): vscode.Diagnostic[] {
    const diagnostics: vscode.Diagnostic[] = [];

    this.addNestedKeysDiagnostics(
      document,
      missingNestedKeysByParent,
      diagnostics
    );
    this.addMissingTranslationsDiagnostics(
      document,
      missingTranslationsByKey,
      diagnostics
    );
    this.addMissingParentTranslationsDiagnostics(
      document,
      currentKeys,
      diagnostics
    );

    return diagnostics;
  }

  private addNestedKeysDiagnostics(
    document: vscode.TextDocument,
    missingNestedKeysByParent: Map<string, Map<string, Set<string>>>,
    diagnostics: vscode.Diagnostic[]
  ): void {
    for (const [parentKey, localeKeys] of missingNestedKeysByParent) {
      const range = this.findKeyRange(document, parentKey);
      if (range) {
        const message = this.createMissingNestedKeysMessage(
          parentKey,
          localeKeys
        );
        diagnostics.push(this.createDiagnostic(range, message));
      }
    }
  }

  private addMissingTranslationsDiagnostics(
    document: vscode.TextDocument,
    missingTranslationsByKey: Map<string, Set<string>>,
    diagnostics: vscode.Diagnostic[]
  ): void {
    for (const [key, missingLocales] of missingTranslationsByKey) {
      const range = this.findKeyRange(document, key);
      if (range) {
        const message = this.createMissingTranslationMessage(
          key,
          missingLocales
        );
        diagnostics.push(this.createDiagnostic(range, message));
      }
    }
  }

  private addMissingParentTranslationsDiagnostics(
    document: vscode.TextDocument,
    currentKeys: string[],
    diagnostics: vscode.Diagnostic[]
  ): void {
    for (const key of currentKeys) {
      const keyParts = key.split('.');
      if (keyParts.length > 1) {
        const parentKey = keyParts.slice(0, -1).join('.');
        if (!currentKeys.includes(parentKey)) {
          const range = this.findKeyRange(document, key);
          if (range) {
            diagnostics.push(
              this.createMissingParentTranslationDiagnostic(
                range,
                key,
                parentKey
              )
            );
          }
        }
      }
    }
  }

  private createDiagnostic(
    range: vscode.Range,
    message: string
  ): vscode.Diagnostic {
    const diagnostic = new vscode.Diagnostic(
      range,
      message,
      vscode.DiagnosticSeverity.Warning
    );
    diagnostic.source = 'next-intl-hlpr';
    return diagnostic;
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
    const regex = /([a-z]{2})\.json$/;
    const match = regex.exec(fileName);
    return match ? match[1] : undefined;
  }

  private findKeyRange(
    document: vscode.TextDocument,
    key: string
  ): vscode.Range | undefined {
    const text = document.getText();
    const keyParts = key.split('.');
    const lastKey = keyParts[keyParts.length - 1];

    const keyPattern = new RegExp(`"${lastKey}"\\s*:`, 'g');
    const match = keyPattern.exec(text);

    if (!match) return undefined;

    const startPos = document.positionAt(match.index);
    const endPos = document.positionAt(match.index + match[0].length);
    return new vscode.Range(startPos, endPos);
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
    const lines = [`Missing translations in "${parentKey}":`];
    for (const [locale, keys] of localeKeys) {
      lines.push(`${locale} - ${Array.from(keys).join(', ')}`);
    }
    return lines.join('\n');
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
