import * as vscode from 'vscode';
import * as path from 'path';
import {Logger} from '../utils/logger';
import {TranslationService} from './translationService';
import {ConfigService} from './configService';
import {NextIntlConfig, MessageConfig} from '../interfaces/nextIntlConfig';
import {
  DiagnosticInfo,
  MissingNestedKeys,
  MissingTranslation
} from '../interfaces/diagnostics';

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

  /**
   * Initialize the diagnostic service
   */
  async initialize(): Promise<void> {
    await this.setupFileWatcher();
  }

  /**
   * Set up file watcher for translation files
   */
  public async setupFileWatcher(): Promise<void> {
    // Dispose existing watcher if any
    if (this.fileWatcher) {
      this.fileWatcher.dispose();
    }

    const config = await this.configService.getNextIntlConfig();
    if (!config) {
      return;
    }

    const messagesDir = path.dirname(config.requestPath);
    const pattern = this.createMessagesGlobPattern(messagesDir);

    this.fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);
    this.registerFileWatcherHandlers();
  }

  /**
   * Creates a glob pattern for translation files
   */
  private createMessagesGlobPattern(
    messagesDir: string
  ): vscode.RelativePattern {
    return new vscode.RelativePattern(
      vscode.workspace.getWorkspaceFolder(vscode.Uri.file(messagesDir))!,
      'messages/*.json'
    );
  }

  /**
   * Register event handlers for file watcher
   */
  private registerFileWatcherHandlers(): void {
    if (!this.fileWatcher) {
      return;
    }

    this.fileWatcher.onDidChange(this.handleFileChange.bind(this));
    this.fileWatcher.onDidCreate(this.handleFileChange.bind(this));
    this.fileWatcher.onDidDelete(this.handleFileDelete.bind(this));
  }

  /**
   * Handler for file change/create events
   */
  private async handleFileChange(uri: vscode.Uri): Promise<void> {
    this.logger.log(`Translation file changed/created: ${uri.fsPath}`);
    await this.translationService.reloadTranslations();
    await this.updateDiagnostics(await vscode.workspace.openTextDocument(uri));
  }

  /**
   * Handler for file delete events
   */
  private async handleFileDelete(uri: vscode.Uri): Promise<void> {
    this.logger.log(`Translation file deleted: ${uri.fsPath}`);
    await this.translationService.reloadTranslations();
    this.clearDiagnostics(uri);
  }

  /**
   * Update diagnostics for a document and related files
   */
  async updateDiagnostics(document: vscode.TextDocument): Promise<void> {
    if (document.languageId !== 'json') {
      return;
    }

    this.logger.log(`Updating diagnostics for: ${document.uri.fsPath}`);

    try {
      const [config, messageConfig] = await this.getConfigurations();
      if (!config || !messageConfig) {
        return;
      }

      // Get all translations to determine available locales
      const allTranslations = this.translationService.getAllTranslations();
      const locales = allTranslations.map((t) => t.locale);

      // Update diagnostics for all translation files
      await this.updateDiagnosticsForAllLocales(config, messageConfig, locales);
    } catch (error) {
      this.logger.log('Error updating diagnostics', error);
    }
  }

  /**
   * Retrieves configuration objects needed for diagnostics
   */
  private async getConfigurations(): Promise<
    [NextIntlConfig | undefined, MessageConfig | undefined]
  > {
    const config = await this.configService.getNextIntlConfig();
    const messageConfig = this.configService.getMessageConfig();
    return [config, messageConfig];
  }

  /**
   * Updates diagnostics for all locales
   */
  private async updateDiagnosticsForAllLocales(
    config: NextIntlConfig,
    messageConfig: MessageConfig,
    locales: string[]
  ): Promise<void> {
    for (const locale of locales) {
      const filePath = this.resolveMessagePath(config, messageConfig, locale);
      const uri = vscode.Uri.file(filePath);

      try {
        const doc = await vscode.workspace.openTextDocument(uri);
        await this.updateFileDiagnostics(doc);
      } catch (error) {
        // File might not exist yet, that's okay
        this.logger.log(`Could not open file ${filePath}: ${error}`);
      }
    }
  }

  /**
   * Update diagnostics for a specific translation file
   */
  private async updateFileDiagnostics(
    document: vscode.TextDocument
  ): Promise<void> {
    const currentLocale = this.getCurrentLocale(document.uri.fsPath);
    if (!currentLocale) {
      return;
    }

    const allTranslations = this.translationService.getAllTranslations();
    const currentTranslation = allTranslations.find(
      (t) => t.locale === currentLocale
    );
    if (!currentTranslation) {
      return;
    }

    const currentContent = JSON.parse(document.getText());
    const currentKeys = this.getAllKeys(currentContent);

    const diagnosticInfo = await this.analyzeMissingTranslations(
      currentLocale,
      currentTranslation,
      currentKeys,
      document
    );

    const diagnostics = this.createDiagnostics(
      document,
      diagnosticInfo,
      currentKeys
    );

    this.logger.log(
      `Found ${diagnostics.length} missing translations in ${currentLocale}`
    );
    this.diagnosticCollection.set(document.uri, diagnostics);
  }

  /**
   * Analyzes missing translations between locales
   */
  private async analyzeMissingTranslations(
    currentLocale: string,
    currentTranslation: any,
    currentKeys: string[],
    document: vscode.TextDocument
  ): Promise<DiagnosticInfo> {
    const diagnosticInfo: DiagnosticInfo = {
      missingNestedKeysByParent: new Map(),
      missingTranslationsByKey: new Map(),
      missingParentKeys: new Map()
    };

    const allTranslations = this.translationService.getAllTranslations();

    for (const translation of allTranslations) {
      if (translation.locale === currentLocale) {
        continue;
      }

      // Check for missing translations (keys in current locale but missing in other locales)
      this.checkMissingTranslations(
        translation,
        currentTranslation,
        diagnosticInfo.missingTranslationsByKey
      );

      // Compare nested keys between locales
      await this.compareTranslationKeys(
        translation,
        currentKeys,
        document,
        diagnosticInfo
      );
    }

    return diagnosticInfo;
  }

  /**
   * Compares translation keys between locales to find missing keys and nested structures
   */
  private async compareTranslationKeys(
    translation: any,
    currentKeys: string[],
    document: vscode.TextDocument,
    diagnosticInfo: DiagnosticInfo
  ): Promise<void> {
    const [config, messageConfig] = await this.getConfigurations();
    if (!config || !messageConfig) {
      return;
    }

    // Get keys from the other locale's translation file
    const otherFilePath = this.resolveMessagePath(
      config,
      messageConfig,
      translation.locale
    );

    try {
      const otherFileContent = Buffer.from(
        await vscode.workspace.fs.readFile(vscode.Uri.file(otherFilePath))
      ).toString();

      const otherContent = JSON.parse(otherFileContent);
      const otherKeys = this.getAllKeys(otherContent);

      // Compare nested keys
      this.compareNestedKeys(
        otherKeys,
        currentKeys,
        translation.locale,
        diagnosticInfo.missingNestedKeysByParent
      );

      // Compare parent keys
      this.compareParentKeys(
        otherKeys,
        currentKeys,
        translation.locale,
        diagnosticInfo.missingParentKeys
      );
    } catch (error) {
      this.logger.log(`Error comparing translation keys: ${error}`);
    }
  }

  /**
   * Compares nested keys between locales
   */
  private compareNestedKeys(
    otherKeys: string[],
    currentKeys: string[],
    locale: string,
    missingNestedKeysByParent: Map<string, Map<string, Set<string>>>
  ): void {
    const otherParentKeys = this.groupKeysByParent(otherKeys);
    const currentParentKeys = this.groupKeysByParent(currentKeys);

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

  /**
   * Compares parent keys between locales
   */
  private compareParentKeys(
    otherKeys: string[],
    currentKeys: string[],
    locale: string,
    missingParentKeys: Map<string, Set<string>>
  ): void {
    // Get parent keys from both files
    const currentParentKeys = this.extractParentKeys(currentKeys);
    const otherParentKeys = this.extractParentKeys(otherKeys);

    // Find parent keys that exist in other file but not in current file
    for (const parentKey of otherParentKeys) {
      if (!currentParentKeys.includes(parentKey)) {
        if (!missingParentKeys.has(parentKey)) {
          missingParentKeys.set(parentKey, new Set());
        }
        missingParentKeys.get(parentKey)!.add(locale);
      }
    }
  }

  /**
   * Extracts parent keys from a list of keys
   */
  private extractParentKeys(keys: string[]): string[] {
    const parentKeys = new Set<string>();
    for (const key of keys) {
      const keyParts = key.split('.');
      if (keyParts.length > 1) {
        parentKeys.add(keyParts[0]);
      } else {
        // Top-level keys are also parent keys
        parentKeys.add(key);
      }
    }
    return Array.from(parentKeys);
  }

  /**
   * Checks for missing translations between locales
   */
  private checkMissingTranslations(
    translation: any,
    currentTranslation: any,
    missingTranslationsByKey: Map<string, Set<string>>
  ): void {
    // Only check for missing translations in the current file's keys
    for (const [key, value] of currentTranslation.messages) {
      if (!translation.messages.has(key)) {
        const isParentKey = value === '[object]';
        this.recordMissingKey(
          key,
          translation.locale,
          missingTranslationsByKey,
          isParentKey
        );
      }
    }
  }

  /**
   * Records a missing key or translation in the appropriate map
   */
  private recordMissingKey(
    key: string,
    locale: string,
    missingTranslationsByKey: Map<string, Set<string>>,
    isParentKey: boolean
  ): void {
    // For parent keys, use a special prefix to differentiate them
    const targetKey = isParentKey ? `__PARENT__${key}` : key;

    if (!missingTranslationsByKey.has(targetKey)) {
      missingTranslationsByKey.set(targetKey, new Set());
    }
    missingTranslationsByKey.get(targetKey)!.add(locale);
  }

  /**
   * Creates diagnostic objects from analyzed translation data
   */
  private createDiagnostics(
    document: vscode.TextDocument,
    diagnosticInfo: DiagnosticInfo,
    currentKeys: string[]
  ): vscode.Diagnostic[] {
    const diagnostics: vscode.Diagnostic[] = [];

    // Add diagnostics for all types of issues
    this.addDiagnosticsForNestedKeys(
      document,
      diagnosticInfo.missingNestedKeysByParent,
      diagnostics
    );

    this.addDiagnosticsForMissingTranslations(
      document,
      diagnosticInfo.missingTranslationsByKey,
      diagnostics
    );

    this.addDiagnosticsForMissingParentTranslations(
      document,
      currentKeys,
      diagnostics
    );

    this.addDiagnosticsForMissingParentKeys(
      document,
      diagnosticInfo.missingParentKeys,
      diagnostics
    );

    return diagnostics;
  }

  /**
   * Adds diagnostics for missing nested keys
   */
  private addDiagnosticsForNestedKeys(
    document: vscode.TextDocument,
    missingNestedKeysByParent: Map<string, Map<string, Set<string>>>,
    diagnostics: vscode.Diagnostic[]
  ): void {
    for (const [parentKey, localeKeys] of missingNestedKeysByParent) {
      const range = this.findKeyRange(document, parentKey);
      if (range) {
        const message = this.createMissingNestedKeysMessage({
          parentKey,
          localeKeys
        });
        diagnostics.push(this.createDiagnostic(range, message));
      }
    }
  }

  /**
   * Adds diagnostics for missing translations
   */
  private addDiagnosticsForMissingTranslations(
    document: vscode.TextDocument,
    missingTranslationsByKey: Map<string, Set<string>>,
    diagnostics: vscode.Diagnostic[]
  ): void {
    for (const [key, missingLocales] of missingTranslationsByKey) {
      // Check if this is a parent key (marked with __PARENT__ prefix)
      if (key.startsWith('__PARENT__')) {
        const actualKey = key.replace('__PARENT__', '');
        const range = this.findKeyRange(document, actualKey);
        if (range) {
          const message = this.createMissingParentKeyMessage(
            actualKey,
            missingLocales
          );
          diagnostics.push(this.createDiagnostic(range, message));
        }
      } else {
        // Regular translation key
        const range = this.findKeyRange(document, key);
        if (range) {
          const message = this.createMissingTranslationMessage({
            key,
            missingLocales,
            isParentKey: false
          });
          diagnostics.push(this.createDiagnostic(range, message));
        }
      }
    }
  }

  /**
   * Adds diagnostics for missing parent translations
   */
  private addDiagnosticsForMissingParentTranslations(
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

  /**
   * Adds diagnostics for missing parent keys
   */
  private addDiagnosticsForMissingParentKeys(
    document: vscode.TextDocument,
    missingParentKeys: Map<string, Set<string>>,
    diagnostics: vscode.Diagnostic[]
  ): void {
    if (missingParentKeys.size === 0) {
      return;
    }

    // Find the opening brace of the JSON file
    const range = this.findOpeningBraceRange(document);
    if (range) {
      const message = this.createMissingParentKeysMessage(missingParentKeys);
      diagnostics.push(this.createDiagnostic(range, message));
    }
  }

  /**
   * Creates a diagnostic object
   */
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

  /**
   * Gets all keys from an object, flattened with dot notation
   */
  private getAllKeys(obj: any, prefix = ''): string[] {
    const keys: string[] = [];
    this.traverseObject(obj, prefix, keys);
    return keys;
  }

  /**
   * Recursively traverses an object to extract all key paths
   */
  private traverseObject(obj: any, prefix = '', keys: string[] = []): void {
    if (!obj || typeof obj !== 'object') {
      return;
    }

    for (const key in obj) {
      const newKey = prefix ? `${prefix}.${key}` : key;
      keys.push(newKey);

      if (typeof obj[key] === 'object' && obj[key] !== null) {
        this.traverseObject(obj[key], newKey, keys);
      }
    }
  }

  /**
   * Creates a diagnostic for missing parent translation
   */
  private createMissingParentTranslationDiagnostic(
    range: vscode.Range,
    key: string,
    parentKey: string
  ): vscode.Diagnostic {
    const message = `Missing parent translation "${parentKey}" for key "${key}"`;
    return this.createDiagnostic(range, message);
  }

  /**
   * Extracts the locale from a file path
   */
  private getCurrentLocale(filePath: string): string | undefined {
    const fileName = path.basename(filePath);
    const regex = /([a-z]{2})\.json$/;
    const match = regex.exec(fileName);
    return match ? match[1] : undefined;
  }

  /**
   * Finds the range for a key in a document
   */
  private findKeyRange(
    document: vscode.TextDocument,
    key: string
  ): vscode.Range | undefined {
    const text = document.getText();
    const keyParts = key.split('.');

    if (keyParts.length === 1) {
      return this.findSimpleKeyRange(document, text, keyParts[0]);
    }

    // For nested keys, try more complex search methods
    return this.findNestedKeyRange(document, text, keyParts);
  }

  /**
   * Finds a simple (non-nested) key in a document
   */
  private findSimpleKeyRange(
    document: vscode.TextDocument,
    text: string,
    key: string
  ): vscode.Range | undefined {
    const keyPattern = new RegExp(`"${key}"\\s*:`, 'g');
    const match = keyPattern.exec(text);
    if (!match) {
      return undefined;
    }

    const startPos = document.positionAt(match.index);
    const endPos = document.positionAt(match.index + match[0].length);
    return new vscode.Range(startPos, endPos);
  }

  /**
   * Finds a nested key in a document
   */
  private findNestedKeyRange(
    document: vscode.TextDocument,
    text: string,
    keyParts: string[]
  ): vscode.Range | undefined {
    try {
      const content = JSON.parse(text);

      // Check if the key exists in the parsed content
      let currentObj = content;
      for (let i = 0; i < keyParts.length - 1; i++) {
        const part = keyParts[i];
        if (!currentObj[part] || typeof currentObj[part] !== 'object') {
          return undefined;
        }
        currentObj = currentObj[part];
      }

      const lastKey = keyParts[keyParts.length - 1];
      if (!(lastKey in currentObj)) {
        return undefined;
      }

      // Search for the key by looking for each part in sequence
      return this.findNestedKeyInText(document, text, keyParts);
    } catch (error) {
      // Fallback to simple search if JSON parsing fails
      this.logger.log(
        'JSON parsing failed in findKeyRange, using fallback search',
        error
      );
      return this.findSimpleKeyRange(
        document,
        text,
        keyParts[keyParts.length - 1]
      );
    }
  }

  /**
   * Finds a nested key in text by traversing through each part
   */
  private findNestedKeyInText(
    document: vscode.TextDocument,
    text: string,
    keyParts: string[]
  ): vscode.Range | undefined {
    let searchStartIndex = 0;

    // Navigate through each level of nesting
    for (let i = 0; i < keyParts.length; i++) {
      const currentKey = keyParts[i];
      const keyPattern = new RegExp(`"${currentKey}"\\s*:`, 'g');
      keyPattern.lastIndex = searchStartIndex;

      const match = keyPattern.exec(text);
      if (!match) {
        return undefined;
      }

      // If this is the last key part, we found our target
      if (i === keyParts.length - 1) {
        return new vscode.Range(
          document.positionAt(match.index),
          document.positionAt(match.index + match[0].length)
        );
      }

      // For intermediate keys, find the opening brace and continue searching from there
      let braceIndex = text.indexOf('{', match.index + match[0].length);
      if (braceIndex === -1) {
        return undefined;
      }

      searchStartIndex = braceIndex + 1;
    }

    return undefined;
  }

  /**
   * Creates a message for missing translation
   */
  private createMissingTranslationMessage(
    missingTranslation: MissingTranslation
  ): string {
    return `Missing translations for key "${missingTranslation.key}" in:\n${Array.from(missingTranslation.missingLocales).join(', ')}`;
  }

  /**
   * Creates a message for missing parent key
   */
  private createMissingParentKeyMessage(
    key: string,
    missingLocales: Set<string>
  ): string {
    return `Missing key "${key}" in:\n${Array.from(missingLocales).join(', ')}`;
  }

  /**
   * Creates a message for missing nested keys
   */
  private createMissingNestedKeysMessage(
    missingNestedKeys: MissingNestedKeys
  ): string {
    const lines = [`Missing translations in "${missingNestedKeys.parentKey}":`];
    for (const [locale, keys] of missingNestedKeys.localeKeys) {
      lines.push(`${locale} - ${Array.from(keys).join(', ')}`);
    }
    return lines.join('\n');
  }

  /**
   * Creates a message for missing parent keys
   */
  private createMissingParentKeysMessage(
    missingParentKeys: Map<string, Set<string>>
  ): string {
    const lines = ['Missing keys in this file:'];
    for (const [parentKey, locales] of missingParentKeys) {
      const localeList = Array.from(locales).join(', ');
      lines.push(`- "${parentKey}" present in: ${localeList}`);
    }
    return lines.join('\n');
  }

  /**
   * Finds the opening brace in a document
   */
  private findOpeningBraceRange(
    document: vscode.TextDocument
  ): vscode.Range | undefined {
    const text = document.getText();
    const openingBraceIndex = text.indexOf('{');
    if (openingBraceIndex === -1) {
      return undefined;
    }

    const position = document.positionAt(openingBraceIndex);
    return new vscode.Range(position, position.translate(0, 1));
  }

  /**
   * Clears diagnostics for a file
   */
  clearDiagnostics(uri: vscode.Uri): void {
    this.diagnosticCollection.delete(uri);
  }

  /**
   * Disposes of resources
   */
  dispose(): void {
    if (this.fileWatcher) {
      this.fileWatcher.dispose();
    }
    this.diagnosticCollection.dispose();
  }

  /**
   * Resolves the path to a message file for a locale
   */
  private resolveMessagePath(
    config: NextIntlConfig,
    messageConfig: MessageConfig,
    locale: string
  ): string {
    const loadPath = messageConfig.loadPath.replace('${locale}', locale);
    const basePath = path.dirname(path.dirname(config.requestPath));
    return path.join(basePath, loadPath);
  }

  /**
   * Groups keys by their parent key
   */
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
}
