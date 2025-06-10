import * as vscode from 'vscode';
import * as path from 'path';
import * as jsonc from 'jsonc-parser';
import {Logger} from '../utils/logger';
import {TranslationService} from './translationService';
import {ConfigService} from './configService';
import {NextIntlConfig, MessageConfig} from '../interfaces/nextIntlConfig';
import {DiagnosticInfo} from '../interfaces/diagnostics';
import {TranslationComparisonUtils} from '../utils/translationComparisonUtils';
import {DiagnosticMessageFactory} from '../utils/diagnosticMessageFactory';
import {Translation} from '../interfaces/translation';

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
   * Helper method to get all translations or a specific translation by locale
   * @param locale Optional locale to retrieve a specific translation
   * @returns All translations or a specific translation if locale is provided
   */
  private getTranslations(
    locale?: string
  ): Translation[] | Translation | undefined {
    const allTranslations = this.translationService.getAllTranslations();

    if (locale) {
      return allTranslations.find((t: Translation) => t.locale === locale);
    }

    return allTranslations;
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

    try {
      const document = await vscode.workspace.openTextDocument(uri);

      // Use jsonc-parser to validate the document
      const rootNode = this.parseJsoncDocument(document.getText());

      if (!rootNode) {
        this.logger.log(`Invalid JSON in file: ${uri.fsPath}`);
        return;
      }

      await this.translationService.reloadTranslations();
      await this.updateDiagnostics(document);
    } catch (error) {
      this.logger.log(`Error handling file change: ${error}`);
    }
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
      const allTranslations = this.getTranslations() as Translation[];
      const locales = allTranslations.map((t: Translation) => t.locale);

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

    const currentTranslation = this.getTranslations(currentLocale);
    if (!currentTranslation) {
      return;
    }

    // Parse the document using jsonc-parser with location information
    const rootNode = this.parseJsoncDocument(document.getText());
    if (!rootNode) {
      this.logger.log(`Failed to parse JSON document: ${document.uri.fsPath}`);
      return;
    }

    // Extract content from the rootNode instead of parsing again
    const currentContent = jsonc.getNodeValue(rootNode);
    const currentKeys = TranslationComparisonUtils.getAllKeys(currentContent);

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

    const allTranslations = this.getTranslations() as Translation[];

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

      // Parse once and extract value
      const otherRootNode = this.parseJsoncDocument(otherFileContent);
      const otherContent = jsonc.getNodeValue(otherRootNode);

      // Get all keys using utility class
      const otherKeys = TranslationComparisonUtils.getAllKeys(otherContent);

      // Compare nested keys using utility class
      TranslationComparisonUtils.compareNestedKeys(
        otherKeys,
        currentKeys,
        translation.locale,
        diagnosticInfo.missingNestedKeysByParent
      );

      // Compare parent keys using utility class
      TranslationComparisonUtils.compareParentKeys(
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

    // Create processors for each diagnostic type
    const processors = this.createDiagnosticProcessors();

    // Process diagnostics for each type of issue using a generic approach
    this.processDiagnosticsGeneric(
      document,
      diagnosticInfo.missingNestedKeysByParent,
      diagnostics,
      processors.nestedKeys
    );

    this.processDiagnosticsGeneric(
      document,
      diagnosticInfo.missingTranslationsByKey,
      diagnostics,
      processors.translationKeys
    );

    // Process parent keys if any exist
    if (diagnosticInfo.missingParentKeys.size > 0) {
      processors.parentKeys(
        document,
        diagnosticInfo.missingParentKeys,
        diagnostics
      );
    }

    return diagnostics;
  }

  /**
   * Creates processors for different diagnostic types
   * @returns An object containing processors for different diagnostic types
   */
  private createDiagnosticProcessors() {
    return {
      nestedKeys: (
        document: vscode.TextDocument,
        parentKey: string,
        localeKeys: Map<string, Set<string>>,
        diagnostics: vscode.Diagnostic[]
      ) => {
        this.addDiagnostic(
          document,
          parentKey,
          DiagnosticMessageFactory.MessageType.MISSING_NESTED_KEYS,
          {
            parentKey,
            localeKeys
          },
          diagnostics
        );
      },

      translationKeys: (
        document: vscode.TextDocument,
        key: string,
        missingLocales: Set<string>,
        diagnostics: vscode.Diagnostic[]
      ) => {
        // Check if this is a parent key (marked with __PARENT__ prefix)
        if (key.startsWith('__PARENT__')) {
          const actualKey = key.replace('__PARENT__', '');
          this.addDiagnostic(
            document,
            actualKey,
            DiagnosticMessageFactory.MessageType.MISSING_PARENT_KEY,
            {
              key: actualKey,
              missingLocales
            },
            diagnostics
          );
        } else {
          // Regular translation key
          this.addDiagnostic(
            document,
            key,
            DiagnosticMessageFactory.MessageType.MISSING_TRANSLATION,
            {
              key,
              missingLocales,
              isParentKey: false
            },
            diagnostics
          );
        }
      },

      parentKeys: (
        document: vscode.TextDocument,
        missingParentKeys: Map<string, Set<string>>,
        diagnostics: vscode.Diagnostic[]
      ) => {
        // Find the opening brace of the JSON file using jsonc-parser
        const range = this.findOpeningBraceRange(document);
        if (range) {
          const message = DiagnosticMessageFactory.createMessage(
            DiagnosticMessageFactory.MessageType.MISSING_PARENT_KEYS,
            missingParentKeys
          );
          diagnostics.push(this.createDiagnostic(range, message));
        }
      }
    };
  }

  /**
   * Generic method to process diagnostics based on a provided processor function
   * @param document The document to add diagnostics to
   * @param data The data to process
   * @param diagnostics The array to add diagnostics to
   * @param processorFn The function to process each item
   */
  private processDiagnosticsGeneric<T>(
    document: vscode.TextDocument,
    data: Map<string, T>,
    diagnostics: vscode.Diagnostic[],
    processorFn: (
      document: vscode.TextDocument,
      key: string,
      value: T,
      diagnostics: vscode.Diagnostic[]
    ) => void
  ): void {
    for (const [key, value] of data) {
      processorFn(document, key, value, diagnostics);
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
   * Extracts the locale from a file path
   */
  private getCurrentLocale(filePath: string): string | undefined {
    const fileName = path.basename(filePath);
    const regex = /([a-z]{2})\.json$/;
    const match = regex.exec(fileName);
    return match ? match[1] : undefined;
  }

  /**
   * Finds the range for a key in a document using jsonc.findNodeAtLocation
   */
  private findKeyRange(
    document: vscode.TextDocument,
    key: string
  ): vscode.Range | undefined {
    const text = document.getText();
    const rootNode = this.parseJsoncDocument(text);
    if (!rootNode) {
      return undefined;
    }

    const keyParts = key.split('.');

    // Use findNodeAtLocation directly for path lookup
    const node = jsonc.findNodeAtLocation(rootNode, keyParts);

    if (node?.parent?.type === 'property') {
      const propertyNode = node.parent;
      const keyNode = propertyNode.children?.[0];

      if (keyNode) {
        const startPosition = document.positionAt(keyNode.offset);
        const endPosition = document.positionAt(
          keyNode.offset + keyNode.length
        );
        return new vscode.Range(startPosition, endPosition);
      }
    }

    return undefined;
  }

  /**
   * Finds the opening brace in a document with improved jsonc usage
   */
  private findOpeningBraceRange(
    document: vscode.TextDocument
  ): vscode.Range | undefined {
    const text = document.getText();
    const rootNode = this.parseJsoncDocument(text);
    if (!rootNode || rootNode.type !== 'object') {
      return undefined;
    }

    // Get more precise position information using node offset
    const startPos = document.positionAt(rootNode.offset);
    // The opening brace is exactly at the node offset
    return new vscode.Range(startPos, startPos.translate(0, 1));
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
   * Parses a JSON document using jsonc-parser
   * @param text The document text to parse
   * @param withLocationInfo Whether to include location information
   * @returns The parsed document
   */
  private parseJsoncDocument(
    text: string,
    withLocationInfo: boolean = true
  ): any {
    const options = {allowTrailingComma: true};
    return withLocationInfo
      ? jsonc.parseTree(text, [], options)
      : jsonc.parse(text, [], options);
  }

  /**
   * Adds a diagnostic for a key in a document
   */
  private addDiagnostic(
    document: vscode.TextDocument,
    key: string,
    messageType: (typeof DiagnosticMessageFactory.MessageType)[keyof typeof DiagnosticMessageFactory.MessageType],
    messageData: any,
    diagnostics: vscode.Diagnostic[]
  ): void {
    const range = this.findKeyRange(document, key);
    if (range) {
      const message = DiagnosticMessageFactory.createMessage(
        messageType,
        messageData
      );
      diagnostics.push(this.createDiagnostic(range, message));
    }
  }
}
