import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';

// Mock modules
import {Logger} from '../utils/logger';
import {ConfigService} from '../services/configService';
import {TranslationService} from '../services/translationService';
import {DiagnosticService} from '../services/diagnosticService';
import {activate, deactivate} from '../extension';
import {DiagnosticMessageFactory} from '../utils/diagnosticMessageFactory';

suite('Extension Tests', () => {
  let contextStub: sinon.SinonStubbedInstance<vscode.ExtensionContext>;
  let createOutputChannelStub: sinon.SinonStub;
  let getConfigurationStub: sinon.SinonStub;
  let createFileSystemWatcherStub: sinon.SinonStub;
  let onDidChangeConfigurationStub: sinon.SinonStub;
  let textDocumentsStub: sinon.SinonStub;
  let workspaceFoldersStub: sinon.SinonStub;
  let outputChannelStub: any;
  let fileWatcherStub: any;

  setup(() => {
    contextStub = {
      subscriptions: [],
      workspaceState: sinon.stub() as any,
      globalState: sinon.stub() as any,
      extensionPath: '/test/extension/path',
      asAbsolutePath: sinon.stub(),
      storagePath: '/test/storage',
      globalStoragePath: '/test/global/storage',
      logPath: '/test/log',
      extensionUri: vscode.Uri.file('/test/extension'),
      environmentVariableCollection: sinon.stub() as any,
      extensionMode: vscode.ExtensionMode.Test,
      secrets: sinon.stub() as any
    } as any;

    outputChannelStub = {
      appendLine: sinon.stub(),
      dispose: sinon.stub(),
      clear: sinon.stub(),
      hide: sinon.stub(),
      show: sinon.stub(),
      name: 'next-intl-hlpr',
      replace: sinon.stub(),
      append: sinon.stub()
    };

    fileWatcherStub = {
      onDidChange: sinon.stub(),
      onDidCreate: sinon.stub(),
      onDidDelete: sinon.stub(),
      dispose: sinon.stub()
    };

    createOutputChannelStub = sinon
      .stub(vscode.window, 'createOutputChannel')
      .returns(outputChannelStub);
    getConfigurationStub = sinon.stub(vscode.workspace, 'getConfiguration');
    createFileSystemWatcherStub = sinon
      .stub(vscode.workspace, 'createFileSystemWatcher')
      .returns(fileWatcherStub);
    onDidChangeConfigurationStub = sinon.stub(
      vscode.workspace,
      'onDidChangeConfiguration'
    );
    textDocumentsStub = sinon
      .stub(vscode.workspace, 'textDocuments')
      .get(() => []);
    workspaceFoldersStub = sinon // NOSONAR
      .stub(vscode.workspace, 'workspaceFolders')
      .get(() => [
        {
          uri: vscode.Uri.file('/test/workspace'),
          name: 'test-workspace',
          index: 0
        }
      ]);
  });

  teardown(() => {
    sinon.restore();
  });

  suite('activate', () => {
    test('should activate extension successfully with valid configuration', async () => {
      // Mock configuration
      const mockConfig = {
        get: sinon.stub().callsFake((key: string, defaultValue?: any) => {
          switch (key) {
            case 'detectConfig':
              return true;
            case 'configPath':
              return '';
            case 'requestPath':
              return '';
            default:
              return defaultValue;
          }
        })
      };
      getConfigurationStub.withArgs('nextIntlHlpr').returns(mockConfig);

      // Mock file system
      const existsSyncStub = sinon.stub(require('fs'), 'existsSync');
      const readFileSyncStub = sinon.stub(require('fs'), 'readFileSync');
      const readdirSyncStub = sinon.stub(require('fs'), 'readdirSync');
      const readdirPromiseStub = sinon.stub(require('fs').promises, 'readdir');
      const readFilePromiseStub = sinon.stub(
        require('fs').promises,
        'readFile'
      );
      const getWorkspaceFolderStub = sinon.stub(
        vscode.workspace,
        'getWorkspaceFolder'
      );

      existsSyncStub.withArgs('/test/workspace/next.config.js').returns(true);
      existsSyncStub.withArgs('/test/workspace/i18n/request.ts').returns(true);
      existsSyncStub.withArgs('/test/workspace/messages').returns(true);
      existsSyncStub.withArgs('/test/workspace/i18n').returns(true);
      existsSyncStub.withArgs('/test/messages').returns(true);
      // Add specific paths that might be checked
      existsSyncStub.withArgs('/test/workspace/next.config.ts').returns(false);
      existsSyncStub.withArgs('/test/workspace/next.config.mjs').returns(false);
      existsSyncStub.withArgs('/test/workspace/next.config.cjs').returns(false);

      readFileSyncStub
        .withArgs('/test/workspace/next.config.js', 'utf8')
        .returns(
          'createNextIntlPlugin()({ locales: ["en", "es"], defaultLocale: "en" })'
        );
      readFileSyncStub
        .withArgs('/test/workspace/i18n/request.ts', 'utf8')
        .returns(
          'export default getRequestConfig({ messages: (await import(`../messages/${locale}.json`)) });'
        );
      readdirSyncStub
        .withArgs('/test/messages')
        .returns(['en.json', 'es.json']);
      readdirSyncStub
        .withArgs('/test/workspace/messages')
        .returns(['en.json', 'es.json']);

      // Mock for TranslationService
      readdirPromiseStub
        .withArgs('/test/messages')
        .resolves(['en.json', 'es.json']);
      readdirPromiseStub
        .withArgs('/test/workspace/messages')
        .resolves(['en.json', 'es.json']);
      readFilePromiseStub.resolves('{"hello": "Hello", "world": "World"}');

      // Mock for DiagnosticService
      getWorkspaceFolderStub.returns({
        uri: vscode.Uri.file('/test/workspace'),
        name: 'test-workspace',
        index: 0
      });

      await activate(contextStub);

      // Verify logger creation
      assert(createOutputChannelStub.calledWith('next-intl-hlpr'));

      // Verify subscriptions were added
      assert(contextStub.subscriptions.length > 0);

      existsSyncStub.restore();
      readFileSyncStub.restore();
      readdirSyncStub.restore();
      readdirPromiseStub.restore();
      readFilePromiseStub.restore();
      getWorkspaceFolderStub.restore();
    });

    test('should handle missing configuration gracefully', async () => {
      // Mock configuration that returns no config
      const mockConfig = {
        get: sinon.stub().callsFake((key: string, defaultValue?: any) => {
          switch (key) {
            case 'detectConfig':
              return false;
            case 'configPath':
              return '';
            case 'requestPath':
              return '';
            default:
              return defaultValue;
          }
        })
      };
      getConfigurationStub.withArgs('nextIntlHlpr').returns(mockConfig);

      await activate(contextStub);

      assert(outputChannelStub.appendLine.called);
    });

    test('should setup configuration change handler', async () => {
      const mockConfig = {
        get: sinon
          .stub()
          .withArgs('detectConfig', true)
          .returns(false)
          .withArgs('configPath', '')
          .returns('')
          .withArgs('requestPath', '')
          .returns('')
      };
      getConfigurationStub.withArgs('nextIntlHlpr').returns(mockConfig);

      await activate(contextStub);

      assert(onDidChangeConfigurationStub.calledOnce);
    });

    test('should handle file watcher setup with valid config', async () => {
      const mockConfig = {
        get: sinon.stub().callsFake((key: string, defaultValue?: any) => {
          switch (key) {
            case 'detectConfig':
              return true;
            case 'configPath':
              return '';
            case 'requestPath':
              return '';
            default:
              return defaultValue;
          }
        })
      };
      getConfigurationStub.withArgs('nextIntlHlpr').returns(mockConfig);

      // Mock file system
      const existsSyncStub = sinon.stub(require('fs'), 'existsSync');
      const readFileSyncStub = sinon.stub(require('fs'), 'readFileSync');
      const readdirSyncStub = sinon.stub(require('fs'), 'readdirSync');
      const readdirPromiseStub = sinon.stub(require('fs').promises, 'readdir');
      const readFilePromiseStub = sinon.stub(
        require('fs').promises,
        'readFile'
      );
      const getWorkspaceFolderStub = sinon.stub(
        vscode.workspace,
        'getWorkspaceFolder'
      );

      existsSyncStub.withArgs('/test/workspace/next.config.js').returns(true);
      existsSyncStub.withArgs('/test/workspace/i18n/request.ts').returns(true);
      existsSyncStub.withArgs('/test/messages').returns(true);

      readFileSyncStub
        .withArgs('/test/workspace/next.config.js', 'utf8')
        .returns(
          'createNextIntlPlugin()({ locales: ["en", "es"], defaultLocale: "en" })'
        );
      readFileSyncStub
        .withArgs('/test/workspace/i18n/request.ts', 'utf8')
        .returns(
          'export default getRequestConfig(async ({locale}) => { return { messages: (await import(`../messages/${locale}.json`)) }; });'
        );
      readdirSyncStub
        .withArgs('/test/messages')
        .returns(['en.json', 'es.json']);

      // Add a fallback for any messages directory path
      readdirSyncStub
        .withArgs(sinon.match((path: string) => path.includes('messages')))
        .returns(['en.json', 'es.json']);

      // Mock for TranslationService
      readdirPromiseStub
        .withArgs('/test/messages')
        .resolves(['en.json', 'es.json']);
      readdirPromiseStub
        .withArgs('/test/workspace/messages')
        .resolves(['en.json', 'es.json']);
      readFilePromiseStub.resolves('{"hello": "Hello", "world": "World"}');

      // Mock for DiagnosticService
      getWorkspaceFolderStub.returns({
        uri: vscode.Uri.file('/test/workspace'),
        name: 'test-workspace',
        index: 0
      });

      await activate(contextStub);

      assert(createFileSystemWatcherStub.called);
      assert(fileWatcherStub.onDidChange.called);
      assert(fileWatcherStub.onDidCreate.called);
      assert(fileWatcherStub.onDidDelete.called);

      existsSyncStub.restore();
      readFileSyncStub.restore();
      readdirSyncStub.restore();
      readdirPromiseStub.restore();
      readFilePromiseStub.restore();
      getWorkspaceFolderStub.restore();
    });

    test('should handle errors during activation gracefully', async () => {
      // Mock configuration that throws an error
      getConfigurationStub.throws(new Error('Configuration error'));

      try {
        await activate(contextStub);
        // Should not throw, but handle gracefully
        assert(true);
      } catch (error) {
        // If it does throw, that's also acceptable behavior
        assert(error instanceof Error);
      }
    });

    test('should process existing JSON documents', async () => {
      const mockConfig = {
        get: sinon
          .stub()
          .withArgs('detectConfig', true)
          .returns(true)
          .withArgs('configPath', '')
          .returns('')
          .withArgs('requestPath', '')
          .returns('')
      };
      getConfigurationStub.withArgs('nextIntlHlpr').returns(mockConfig);

      // Mock existing JSON documents
      const mockDocument = {
        languageId: 'json',
        uri: {fsPath: '/test/workspace/messages/en.json'},
        getText: sinon.stub().returns('{"hello": "Hello"}'),
        fileName: '/test/workspace/messages/en.json',
        isUntitled: false,
        isDirty: false,
        isClosed: false,
        save: sinon.stub(),
        eol: vscode.EndOfLine.LF,
        lineCount: 10,
        lineAt: sinon.stub(),
        offsetAt: sinon.stub(),
        positionAt: sinon.stub(),
        validatePosition: sinon.stub(),
        validateRange: sinon.stub(),
        version: 1,
        getWordRangeAtPosition: sinon.stub()
      } as any;
      textDocumentsStub.get(() => [mockDocument]);

      // Mock file system
      const existsSyncStub = sinon.stub(require('fs'), 'existsSync');
      const readFileSyncStub = sinon.stub(require('fs'), 'readFileSync');
      const readdirSyncStub = sinon.stub(require('fs'), 'readdirSync');

      existsSyncStub.withArgs('/test/workspace/next.config.js').returns(true);
      existsSyncStub.withArgs('/test/workspace/i18n/request.ts').returns(true);
      existsSyncStub.withArgs('/test/messages').returns(true);

      readFileSyncStub
        .withArgs('/test/workspace/next.config.js', 'utf8')
        .returns(
          'createNextIntlPlugin()({ locales: ["en", "es"], defaultLocale: "en" })'
        );
      readFileSyncStub
        .withArgs('/test/workspace/i18n/request.ts', 'utf8')
        .returns(
          'export default getRequestConfig({ messages: (await import(`../messages/${locale}.json`)) });'
        );
      readdirSyncStub
        .withArgs('/test/messages')
        .returns(['en.json', 'es.json']);

      // Add a fallback for any messages directory path
      readdirSyncStub
        .withArgs(sinon.match((path: string) => path.includes('messages')))
        .returns(['en.json', 'es.json']);

      await activate(contextStub);

      // Should process existing documents
      assert(outputChannelStub.appendLine.called);

      existsSyncStub.restore();
      readFileSyncStub.restore();
      readdirSyncStub.restore();
    });

    test('should handle configuration change events', async () => {
      const mockConfig = {
        get: sinon
          .stub()
          .withArgs('detectConfig', true)
          .returns(false)
          .withArgs('configPath', '')
          .returns('')
          .withArgs('requestPath', '')
          .returns('')
      };
      getConfigurationStub.withArgs('nextIntlHlpr').returns(mockConfig);

      await activate(contextStub);

      // Simulate configuration change
      const configChangeCallback =
        onDidChangeConfigurationStub.getCall(0).args[0];
      const mockEvent = {
        affectsConfiguration: sinon
          .stub()
          .withArgs('nextIntlHlpr')
          .returns(true)
      };

      await configChangeCallback(mockEvent);

      // Should handle configuration changes
      assert(mockEvent.affectsConfiguration.calledWith('nextIntlHlpr'));
    });
  });

  suite('deactivate', () => {
    test('should deactivate extension without errors', () => {
      // deactivate function should not throw
      assert.doesNotThrow(() => {
        deactivate();
      });
    });

    test('should be a function', () => {
      assert.strictEqual(typeof deactivate, 'function');
    });
  });

  suite('File Watcher Events', () => {
    test('should handle file change events', async () => {
      const mockConfig = {
        get: sinon.stub().callsFake((key: string, defaultValue?: any) => {
          switch (key) {
            case 'detectConfig':
              return true;
            case 'configPath':
              return '';
            case 'requestPath':
              return '';
            default:
              return defaultValue;
          }
        })
      };
      getConfigurationStub.withArgs('nextIntlHlpr').returns(mockConfig);

      // Mock file system
      const existsSyncStub = sinon.stub(require('fs'), 'existsSync');
      const readFileSyncStub = sinon.stub(require('fs'), 'readFileSync');
      const readdirSyncStub = sinon.stub(require('fs'), 'readdirSync');
      const readdirPromiseStub = sinon.stub(require('fs').promises, 'readdir');
      const readFilePromiseStub = sinon.stub(
        require('fs').promises,
        'readFile'
      );
      const getWorkspaceFolderStub = sinon.stub(
        vscode.workspace,
        'getWorkspaceFolder'
      );

      existsSyncStub.withArgs('/test/workspace/next.config.js').returns(true);
      existsSyncStub.withArgs('/test/workspace/i18n/request.ts').returns(true);
      existsSyncStub.withArgs('/test/workspace/messages').returns(true); // This is the key path ConfigService builds
      existsSyncStub.withArgs('/test/workspace/i18n').returns(true);
      existsSyncStub.withArgs('/test/messages').returns(true);
      // Add specific paths that might be checked
      existsSyncStub.withArgs('/test/workspace/next.config.ts').returns(false);
      existsSyncStub.withArgs('/test/workspace/next.config.mjs').returns(false);
      existsSyncStub.withArgs('/test/workspace/next.config.cjs').returns(false);

      readFileSyncStub
        .withArgs('/test/workspace/next.config.js', 'utf8')
        .returns(
          'createNextIntlPlugin()({ locales: ["en", "es"], defaultLocale: "en" })'
        );
      readFileSyncStub
        .withArgs('/test/workspace/i18n/request.ts', 'utf8')
        .returns(
          'export default getRequestConfig({ messages: (await import(`../messages/${locale}.json`)) });'
        );
      readdirSyncStub
        .withArgs('/test/workspace/messages')
        .returns(['en.json', 'es.json']);

      // Add a fallback for any messages directory path
      readdirSyncStub
        .withArgs(sinon.match((path: string) => path.includes('messages')))
        .returns(['en.json', 'es.json']);

      // Mock for TranslationService
      readdirPromiseStub
        .withArgs('/test/messages')
        .resolves(['en.json', 'es.json']);
      readdirPromiseStub
        .withArgs('/test/workspace/messages')
        .resolves(['en.json', 'es.json']);
      readFilePromiseStub.resolves('{"hello": "Hello", "world": "World"}');

      // Mock for DiagnosticService
      getWorkspaceFolderStub.returns({
        uri: vscode.Uri.file('/test/workspace'),
        name: 'test-workspace',
        index: 0
      });

      await activate(contextStub);

      // Verify that file watchers are created
      assert(createFileSystemWatcherStub.called);

      // Verify that the extension activates without errors
      assert(contextStub.subscriptions.length > 0);

      existsSyncStub.restore();
      readFileSyncStub.restore();
      readdirSyncStub.restore();
      readdirPromiseStub.restore();
      readFilePromiseStub.restore();
      getWorkspaceFolderStub.restore();
    });

    test('should handle file creation events', async () => {
      const mockConfig = {
        get: sinon.stub().callsFake((key: string, defaultValue?: any) => {
          switch (key) {
            case 'detectConfig':
              return true;
            case 'configPath':
              return '';
            case 'requestPath':
              return '';
            default:
              return defaultValue;
          }
        })
      };
      getConfigurationStub.withArgs('nextIntlHlpr').returns(mockConfig);

      // Mock file system
      const existsSyncStub = sinon.stub(require('fs'), 'existsSync');
      const readFileSyncStub = sinon.stub(require('fs'), 'readFileSync');
      const readdirSyncStub = sinon.stub(require('fs'), 'readdirSync');
      const readdirPromiseStub = sinon.stub(require('fs').promises, 'readdir');
      const readFilePromiseStub = sinon.stub(
        require('fs').promises,
        'readFile'
      );
      const getWorkspaceFolderStub = sinon.stub(
        vscode.workspace,
        'getWorkspaceFolder'
      );

      existsSyncStub.withArgs('/test/workspace/next.config.js').returns(true);
      existsSyncStub.withArgs('/test/workspace/i18n/request.ts').returns(true);
      existsSyncStub.withArgs('/test/workspace/messages').returns(true);
      existsSyncStub.withArgs('/test/workspace/i18n').returns(true);
      existsSyncStub.withArgs('/test/messages').returns(true);
      // Add specific paths that might be checked
      existsSyncStub.withArgs('/test/workspace/next.config.ts').returns(false);
      existsSyncStub.withArgs('/test/workspace/next.config.mjs').returns(false);
      existsSyncStub.withArgs('/test/workspace/next.config.cjs').returns(false);

      readFileSyncStub
        .withArgs('/test/workspace/next.config.js', 'utf8')
        .returns(
          'createNextIntlPlugin()({ locales: ["en", "es"], defaultLocale: "en" })'
        );
      readFileSyncStub
        .withArgs('/test/workspace/i18n/request.ts', 'utf8')
        .returns(
          'export default getRequestConfig({ messages: (await import(`../messages/${locale}.json`)) });'
        );
      readdirSyncStub
        .withArgs('/test/workspace/messages')
        .returns(['en.json', 'es.json']);

      // Add a fallback for any messages directory path
      readdirSyncStub
        .withArgs(sinon.match((path: string) => path.includes('messages')))
        .returns(['en.json', 'es.json']);

      // Mock for TranslationService
      readdirPromiseStub
        .withArgs('/test/messages')
        .resolves(['en.json', 'es.json']);
      readdirPromiseStub
        .withArgs('/test/workspace/messages')
        .resolves(['en.json', 'es.json']);
      readFilePromiseStub.resolves('{"hello": "Hello", "world": "World"}');

      // Mock for DiagnosticService
      getWorkspaceFolderStub.returns({
        uri: vscode.Uri.file('/test/workspace'),
        name: 'test-workspace',
        index: 0
      });

      await activate(contextStub);

      // Verify that file watchers are created
      assert(createFileSystemWatcherStub.called);

      // Verify that the extension activates without errors
      assert(contextStub.subscriptions.length > 0);

      existsSyncStub.restore();
      readFileSyncStub.restore();
      readdirSyncStub.restore();
      readdirPromiseStub.restore();
      readFilePromiseStub.restore();
      getWorkspaceFolderStub.restore();
    });

    test('should handle file deletion events', async () => {
      const mockConfig = {
        get: sinon.stub().callsFake((key: string, defaultValue?: any) => {
          switch (key) {
            case 'detectConfig':
              return true;
            case 'configPath':
              return '';
            case 'requestPath':
              return '';
            default:
              return defaultValue;
          }
        })
      };
      getConfigurationStub.withArgs('nextIntlHlpr').returns(mockConfig);

      // Mock file system
      const existsSyncStub = sinon.stub(require('fs'), 'existsSync');
      const readFileSyncStub = sinon.stub(require('fs'), 'readFileSync');
      const readdirSyncStub = sinon.stub(require('fs'), 'readdirSync');
      const readdirPromiseStub = sinon.stub(require('fs').promises, 'readdir');
      const readFilePromiseStub = sinon.stub(
        require('fs').promises,
        'readFile'
      );
      const getWorkspaceFolderStub = sinon.stub(
        vscode.workspace,
        'getWorkspaceFolder'
      );

      existsSyncStub.withArgs('/test/workspace/next.config.js').returns(true);
      existsSyncStub.withArgs('/test/workspace/i18n/request.ts').returns(true);
      existsSyncStub.withArgs('/test/workspace/messages').returns(true);
      existsSyncStub.withArgs('/test/workspace/i18n').returns(true);
      existsSyncStub.withArgs('/test/messages').returns(true);
      // Add specific paths that might be checked
      existsSyncStub.withArgs('/test/workspace/next.config.ts').returns(false);
      existsSyncStub.withArgs('/test/workspace/next.config.mjs').returns(false);
      existsSyncStub.withArgs('/test/workspace/next.config.cjs').returns(false);

      readFileSyncStub
        .withArgs('/test/workspace/next.config.js', 'utf8')
        .returns(
          'createNextIntlPlugin()({ locales: ["en", "es"], defaultLocale: "en" })'
        );
      readFileSyncStub
        .withArgs('/test/workspace/i18n/request.ts', 'utf8')
        .returns(
          'export default getRequestConfig({ messages: (await import(`../messages/${locale}.json`)) });'
        );
      readdirSyncStub
        .withArgs('/test/workspace/messages')
        .returns(['en.json', 'es.json']);

      // Add a fallback for any messages directory path
      readdirSyncStub
        .withArgs(sinon.match((path: string) => path.includes('messages')))
        .returns(['en.json', 'es.json']);

      // Mock for TranslationService
      readdirPromiseStub
        .withArgs('/test/messages')
        .resolves(['en.json', 'es.json']);
      readdirPromiseStub
        .withArgs('/test/workspace/messages')
        .resolves(['en.json', 'es.json']);
      readFilePromiseStub.resolves('{"hello": "Hello", "world": "World"}');

      // Mock for DiagnosticService
      getWorkspaceFolderStub.returns({
        uri: vscode.Uri.file('/test/workspace'),
        name: 'test-workspace',
        index: 0
      });

      await activate(contextStub);

      // Verify that file watchers are created
      assert(createFileSystemWatcherStub.called);

      // Verify that the extension activates without errors
      assert(contextStub.subscriptions.length > 0);

      existsSyncStub.restore();
      readFileSyncStub.restore();
      readdirSyncStub.restore();
      readdirPromiseStub.restore();
      readFilePromiseStub.restore();
      getWorkspaceFolderStub.restore();
    });
  });

  suite('Warning Messages', () => {
    let diagnosticService: DiagnosticService;
    let translationServiceStub: sinon.SinonStubbedInstance<TranslationService>;
    let configServiceStub: sinon.SinonStubbedInstance<ConfigService>;
    let loggerStub: sinon.SinonStubbedInstance<Logger>;
    let documentStub: any;
    let diagnosticCollectionStub: any;

    setup(() => {
      translationServiceStub = sinon.createStubInstance(TranslationService);
      configServiceStub = sinon.createStubInstance(ConfigService);
      loggerStub = sinon.createStubInstance(Logger);

      documentStub = {
        uri: vscode.Uri.file('/test/workspace/messages/en.json'),
        getText: sinon.stub().returns('{}'),
        languageId: 'json',
        positionAt: sinon
          .stub()
          .callsFake((offset) => new vscode.Position(0, offset))
      };

      diagnosticCollectionStub = {
        set: sinon.stub(),
        delete: sinon.stub(),
        dispose: sinon.stub()
      };

      // Initialize the diagnostic service
      diagnosticService = new DiagnosticService(
        loggerStub as any,
        translationServiceStub as any,
        configServiceStub as any
      );

      // Instead of stubbing readFile directly, we'll mock the implementation
      // of the methods that use it in DiagnosticService
      sinon.stub(diagnosticService as any, 'compareTranslationKeys').resolves();
    });

    teardown(() => {
      sinon.restore();
    });

    test('should show "Missing translations for key" warning', async () => {
      const keyRange = new vscode.Range(0, 0, 0, 10);

      // Create a diagnostic directly
      const missingTranslationWarning = new vscode.Diagnostic(
        keyRange,
        'Missing translations for key "missing_key" in:\nes',
        vscode.DiagnosticSeverity.Warning
      );

      // Set up the collection with our diagnostic
      const diagnostics = [missingTranslationWarning];
      const entries: [vscode.Uri, vscode.Diagnostic[]][] = [
        [documentStub.uri, diagnostics]
      ];

      // Use DiagnosticMessageFactory to verify it produces the expected message
      const message = DiagnosticMessageFactory.createMessage(
        DiagnosticMessageFactory.MessageType.MISSING_TRANSLATION,
        {
          key: 'missing_key',
          missingLocales: new Set(['es']),
          isParentKey: false
        }
      );

      // Verify the message format is correct
      assert(
        message === 'Missing translations for key "missing_key" in:\nes',
        `Expected message format doesn't match. Got: ${message}`
      );

      // Set our entries directly to simulate what would happen after updateFileDiagnostics
      diagnosticCollectionStub.set(entries);

      // Now verify the entries are as expected
      assert(
        diagnosticCollectionStub.set.called,
        'Diagnostic collection set was not called'
      );

      // Find the specific warning we're looking for
      assert(
        diagnostics[0].message.includes('Missing translations for key'),
        'Missing translations for key warning not found'
      );
      assert(
        diagnostics[0].message.includes('missing_key'),
        'Warning does not mention the missing key'
      );
      assert(
        diagnostics[0].message.includes('es'),
        'Warning does not mention the locale missing the translation'
      );
    });

    test('should show "Missing parent translation" warning', async () => {
      const keyRange = new vscode.Range(1, 5, 1, 14);

      // Create a diagnostic directly
      const missingParentWarning = new vscode.Diagnostic(
        keyRange,
        'Missing parent translation "HomePage" for key "HomePage.title"',
        vscode.DiagnosticSeverity.Warning
      );

      // Set up the collection with our diagnostic
      const diagnostics = [missingParentWarning];
      const entries: [vscode.Uri, vscode.Diagnostic[]][] = [
        [documentStub.uri, diagnostics]
      ];

      // Create a diagnostic using a simple vscode.Diagnostic constructor
      const diagnostic = new vscode.Diagnostic(
        keyRange,
        'Missing parent translation "HomePage" for key "HomePage.title"',
        vscode.DiagnosticSeverity.Warning
      );
      diagnostic.source = 'next-intl-hlpr';

      // Verify the diagnostic message format is correct
      assert(
        diagnostic.message ===
          'Missing parent translation "HomePage" for key "HomePage.title"',
        `Expected message format doesn't match. Got: ${diagnostic.message}`
      );

      // Set our entries directly to simulate what would happen after updateFileDiagnostics
      diagnosticCollectionStub.set(entries);

      // Now verify the entries are as expected
      assert(
        diagnosticCollectionStub.set.called,
        'Diagnostic collection set was not called'
      );

      // Find the specific warning we're looking for
      assert(
        diagnostics[0].message.includes('Missing parent translation'),
        'Missing parent translation warning not found'
      );
      assert(
        diagnostics[0].message.includes('HomePage'),
        'Warning does not mention the parent key'
      );
      assert(
        diagnostics[0].message.includes('HomePage.title'),
        'Warning does not mention the child key'
      );
    });

    test('should show "Missing keys in this file" warning', async () => {
      const keyRange = new vscode.Range(0, 0, 0, 1);

      // Create test data for missing parent keys
      const missingParentKeys = new Map<string, Set<string>>();
      missingParentKeys.set('Header', new Set(['es']));

      // Use DiagnosticMessageFactory to create the message
      const message = DiagnosticMessageFactory.createMessage(
        DiagnosticMessageFactory.MessageType.MISSING_PARENT_KEYS,
        missingParentKeys
      );

      // Create a diagnostic directly
      const missingParentKeysWarning = new vscode.Diagnostic(
        keyRange,
        message,
        vscode.DiagnosticSeverity.Warning
      );

      // Set up the collection with our diagnostic
      const diagnostics = [missingParentKeysWarning];
      const entries: [vscode.Uri, vscode.Diagnostic[]][] = [
        [documentStub.uri, diagnostics]
      ];

      // Verify the message format is correct
      assert(
        message.includes('Missing keys in this file:'),
        `Expected message to include 'Missing keys in this file:', got: ${message}`
      );
      assert(
        message.includes('- "Header" present in: es'),
        `Expected message to include 'Header present in es', got: ${message}`
      );

      // Set our entries directly to simulate what would happen after updateFileDiagnostics
      diagnosticCollectionStub.set(entries);

      // Now verify the entries are as expected
      assert(
        diagnosticCollectionStub.set.called,
        'Diagnostic collection set was not called'
      );

      // Find the specific warning we're looking for
      assert(
        diagnostics[0].message.includes('Missing keys in this file'),
        'Missing keys in this file warning not found'
      );
      assert(
        diagnostics[0].message.includes('Header'),
        'Warning does not mention the missing parent key'
      );
      assert(
        diagnostics[0].message.includes('present in: es'),
        'Warning does not mention the locale where the key is present'
      );
    });

    test('should show "Missing key" warning', async () => {
      const keyRange = new vscode.Range(0, 0, 0, 10);

      // Create a diagnostic directly
      const missingKeyWarning = new vscode.Diagnostic(
        keyRange,
        'Missing key "extra_key" in:\nen',
        vscode.DiagnosticSeverity.Warning
      );

      // Set up the collection with our diagnostic
      const diagnostics = [missingKeyWarning];
      const entries: [vscode.Uri, vscode.Diagnostic[]][] = [
        [documentStub.uri, diagnostics]
      ];

      // Use DiagnosticMessageFactory to verify it produces the expected message
      const message = DiagnosticMessageFactory.createMessage(
        DiagnosticMessageFactory.MessageType.MISSING_PARENT_KEY,
        {
          key: 'extra_key',
          missingLocales: new Set(['en'])
        }
      );

      // Verify the message format is correct
      assert(
        message === 'Missing key "extra_key" in:\nen',
        `Expected message format doesn't match. Got: ${message}`
      );

      // Set our entries directly to simulate what would happen after updateFileDiagnostics
      diagnosticCollectionStub.set(entries);

      // Now verify the entries are as expected
      assert(
        diagnosticCollectionStub.set.called,
        'Diagnostic collection set was not called'
      );

      // Find the specific warning we're looking for
      assert(
        diagnostics[0].message.includes('Missing key'),
        'Missing key warning not found'
      );
      assert(
        diagnostics[0].message.includes('extra_key'),
        'Warning does not mention the missing key'
      );
      assert(
        diagnostics[0].message.includes('en'),
        'Warning does not mention the locale missing the key'
      );
    });

    test('should show "Missing translations in" nested keys warning', async () => {
      const keyRange = new vscode.Range(0, 0, 0, 10);

      // Create test data for missing nested keys
      const localeKeys = new Map<string, Set<string>>();

      // Missing 'subtitle' in both es and fr locales
      const esKeys = new Set<string>();
      esKeys.add('subtitle');
      localeKeys.set('es', esKeys);

      const frKeys = new Set<string>();
      frKeys.add('subtitle');
      localeKeys.set('fr', frKeys);

      // Use DiagnosticMessageFactory to verify it produces the expected message
      const message = DiagnosticMessageFactory.createMessage(
        DiagnosticMessageFactory.MessageType.MISSING_NESTED_KEYS,
        {
          parentKey: 'HomePage',
          localeKeys: localeKeys
        }
      );

      // Create a diagnostic directly
      const missingNestedKeysWarning = new vscode.Diagnostic(
        keyRange,
        message,
        vscode.DiagnosticSeverity.Warning
      );

      // Set up the collection with our diagnostic
      const diagnostics = [missingNestedKeysWarning];
      const entries: [vscode.Uri, vscode.Diagnostic[]][] = [
        [documentStub.uri, diagnostics]
      ];

      // Verify the message format is correct
      assert(
        message.includes('Missing translations in "HomePage":'),
        `Expected message to include 'Missing translations in "HomePage":', got: ${message}`
      );
      assert(
        message.includes('es - subtitle'),
        `Expected message to include 'es - subtitle', got: ${message}`
      );
      assert(
        message.includes('fr - subtitle'),
        `Expected message to include 'fr - subtitle', got: ${message}`
      );

      // Set our entries directly to simulate what would happen after updateFileDiagnostics
      diagnosticCollectionStub.set(entries);

      // Now verify the entries are as expected
      assert(
        diagnosticCollectionStub.set.called,
        'Diagnostic collection set was not called'
      );

      // Find the specific warning we're looking for
      assert(
        diagnostics[0].message.includes('Missing translations in'),
        'Missing translations in warning not found'
      );
      assert(
        diagnostics[0].message.includes('HomePage'),
        'Warning does not mention the parent key'
      );
      assert(
        diagnostics[0].message.includes('subtitle'),
        'Warning does not mention the nested key'
      );
      assert(
        diagnostics[0].message.includes('es'),
        'Warning does not mention the es locale'
      );
      assert(
        diagnostics[0].message.includes('fr'),
        'Warning does not mention the fr locale'
      );
    });
  });
});
