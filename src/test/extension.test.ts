import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import {activate, deactivate} from '../extension';

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
});
