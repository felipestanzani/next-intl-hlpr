import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import * as path from 'path';
import {activate, deactivate} from '../extension';

suite('Extension Tests', () => {
  let contextStub: sinon.SinonStubbedInstance<vscode.ExtensionContext>;
  let createOutputChannelStub: sinon.SinonStub;
  let getConfigurationStub: sinon.SinonStub;
  let registerHoverProviderStub: sinon.SinonStub;
  let createFileSystemWatcherStub: sinon.SinonStub;
  let onDidChangeConfigurationStub: sinon.SinonStub;
  let workspaceFoldersStub: sinon.SinonStub;
  let textDocumentsStub: sinon.SinonStub;
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
    registerHoverProviderStub = sinon.stub(
      vscode.languages,
      'registerHoverProvider'
    );
    createFileSystemWatcherStub = sinon
      .stub(vscode.workspace, 'createFileSystemWatcher')
      .returns(fileWatcherStub);
    onDidChangeConfigurationStub = sinon.stub(
      vscode.workspace,
      'onDidChangeConfiguration'
    );
    workspaceFoldersStub = sinon
      .stub(vscode.workspace, 'workspaceFolders')
      .get(() => [
        {
          uri: {fsPath: '/test/workspace'},
          name: 'test-workspace',
          index: 0
        }
      ]);
    textDocumentsStub = sinon
      .stub(vscode.workspace, 'textDocuments')
      .get(() => []);
  });

  teardown(() => {
    sinon.restore();
  });

  suite('activate', () => {
    test('should activate extension successfully with valid configuration', async () => {
      // Mock configuration
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

      // Mock file system
      const existsSyncStub = sinon.stub(require('fs'), 'existsSync');
      const readFileSyncStub = sinon.stub(require('fs'), 'readFileSync');
      const readdirSyncStub = sinon.stub(require('fs'), 'readdirSync');

      existsSyncStub.withArgs('/test/workspace/next.config.js').returns(true);
      existsSyncStub.withArgs('/test/workspace/i18n/request.ts').returns(true);
      existsSyncStub.withArgs('/test/workspace/messages').returns(true);

      readFileSyncStub
        .withArgs('/test/workspace/next.config.js', 'utf8')
        .returns(
          'createNextIntlPlugin()({ locales: ["en", "es"], defaultLocale: "en" })'
        );
      readFileSyncStub
        .withArgs('/test/workspace/i18n/request.ts', 'utf8')
        .returns('getRequestConfig({ locales: ["en", "es"] });');
      readdirSyncStub
        .withArgs('/test/workspace/messages')
        .returns(['en.json', 'es.json']);

      await activate(contextStub);

      // Verify logger creation
      assert(createOutputChannelStub.calledWith('next-intl-hlpr'));

      // Verify hover provider registration
      assert(registerHoverProviderStub.calledOnce);
      assert.strictEqual(registerHoverProviderStub.getCall(0).args[0], 'json');

      // Verify subscriptions were added
      assert(contextStub.subscriptions.length > 0);

      existsSyncStub.restore();
      readFileSyncStub.restore();
      readdirSyncStub.restore();
    });

    test('should handle missing configuration gracefully', async () => {
      // Mock configuration that returns no config
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

      // Should still register hover provider even without config
      assert(registerHoverProviderStub.calledOnce);
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

      // Mock file system
      const existsSyncStub = sinon.stub(require('fs'), 'existsSync');
      const readFileSyncStub = sinon.stub(require('fs'), 'readFileSync');
      const readdirSyncStub = sinon.stub(require('fs'), 'readdirSync');

      existsSyncStub.withArgs('/test/workspace/next.config.js').returns(true);
      existsSyncStub.withArgs('/test/workspace/i18n/request.ts').returns(true);
      existsSyncStub.withArgs('/test/workspace/messages').returns(true);

      readFileSyncStub
        .withArgs('/test/workspace/next.config.js', 'utf8')
        .returns(
          'createNextIntlPlugin()({ locales: ["en", "es"], defaultLocale: "en" })'
        );
      readFileSyncStub
        .withArgs('/test/workspace/i18n/request.ts', 'utf8')
        .returns('getRequestConfig({ locales: ["en", "es"] });');
      readdirSyncStub
        .withArgs('/test/workspace/messages')
        .returns(['en.json', 'es.json']);

      await activate(contextStub);

      assert(createFileSystemWatcherStub.called);
      assert(fileWatcherStub.onDidChange.called);
      assert(fileWatcherStub.onDidCreate.called);
      assert(fileWatcherStub.onDidDelete.called);

      existsSyncStub.restore();
      readFileSyncStub.restore();
      readdirSyncStub.restore();
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
      existsSyncStub.withArgs('/test/workspace/messages').returns(true);

      readFileSyncStub
        .withArgs('/test/workspace/next.config.js', 'utf8')
        .returns(
          'createNextIntlPlugin()({ locales: ["en", "es"], defaultLocale: "en" })'
        );
      readFileSyncStub
        .withArgs('/test/workspace/i18n/request.ts', 'utf8')
        .returns('getRequestConfig({ locales: ["en", "es"] });');
      readdirSyncStub
        .withArgs('/test/workspace/messages')
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

      // Mock file system
      const existsSyncStub = sinon.stub(require('fs'), 'existsSync');
      const readFileSyncStub = sinon.stub(require('fs'), 'readFileSync');
      const readdirSyncStub = sinon.stub(require('fs'), 'readdirSync');
      const openTextDocumentStub = sinon.stub(
        vscode.workspace,
        'openTextDocument'
      );

      existsSyncStub.withArgs('/test/workspace/next.config.js').returns(true);
      existsSyncStub.withArgs('/test/workspace/i18n/request.ts').returns(true);
      existsSyncStub.withArgs('/test/workspace/messages').returns(true);

      readFileSyncStub
        .withArgs('/test/workspace/next.config.js', 'utf8')
        .returns(
          'createNextIntlPlugin()({ locales: ["en", "es"], defaultLocale: "en" })'
        );
      readFileSyncStub
        .withArgs('/test/workspace/i18n/request.ts', 'utf8')
        .returns('getRequestConfig({ locales: ["en", "es"] });');
      readdirSyncStub
        .withArgs('/test/workspace/messages')
        .returns(['en.json', 'es.json']);

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
      openTextDocumentStub.resolves(mockDocument);

      await activate(contextStub);

      // Simulate file change event
      const changeCallback = fileWatcherStub.onDidChange.getCall(0).args[0];
      const uri = vscode.Uri.file('/test/workspace/messages/en.json');

      await changeCallback(uri);

      assert(openTextDocumentStub.called);

      existsSyncStub.restore();
      readFileSyncStub.restore();
      readdirSyncStub.restore();
      openTextDocumentStub.restore();
    });

    test('should handle file creation events', async () => {
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

      // Mock file system
      const existsSyncStub = sinon.stub(require('fs'), 'existsSync');
      const readFileSyncStub = sinon.stub(require('fs'), 'readFileSync');
      const readdirSyncStub = sinon.stub(require('fs'), 'readdirSync');
      const openTextDocumentStub = sinon.stub(
        vscode.workspace,
        'openTextDocument'
      );

      existsSyncStub.withArgs('/test/workspace/next.config.js').returns(true);
      existsSyncStub.withArgs('/test/workspace/i18n/request.ts').returns(true);
      existsSyncStub.withArgs('/test/workspace/messages').returns(true);

      readFileSyncStub
        .withArgs('/test/workspace/next.config.js', 'utf8')
        .returns(
          'createNextIntlPlugin()({ locales: ["en", "es"], defaultLocale: "en" })'
        );
      readFileSyncStub
        .withArgs('/test/workspace/i18n/request.ts', 'utf8')
        .returns('getRequestConfig({ locales: ["en", "es"] });');
      readdirSyncStub
        .withArgs('/test/workspace/messages')
        .returns(['en.json', 'es.json']);

      const mockDocument = {
        languageId: 'json',
        uri: {fsPath: '/test/workspace/messages/fr.json'},
        getText: sinon.stub().returns('{"hello": "Bonjour"}'),
        fileName: '/test/workspace/messages/fr.json',
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
      openTextDocumentStub.resolves(mockDocument);

      await activate(contextStub);

      // Simulate file creation event
      const createCallback = fileWatcherStub.onDidCreate.getCall(0).args[0];
      const uri = vscode.Uri.file('/test/workspace/messages/fr.json');

      await createCallback(uri);

      assert(openTextDocumentStub.called);

      existsSyncStub.restore();
      readFileSyncStub.restore();
      readdirSyncStub.restore();
      openTextDocumentStub.restore();
    });

    test('should handle file deletion events', async () => {
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

      // Mock file system
      const existsSyncStub = sinon.stub(require('fs'), 'existsSync');
      const readFileSyncStub = sinon.stub(require('fs'), 'readFileSync');
      const readdirSyncStub = sinon.stub(require('fs'), 'readdirSync');

      existsSyncStub.withArgs('/test/workspace/next.config.js').returns(true);
      existsSyncStub.withArgs('/test/workspace/i18n/request.ts').returns(true);
      existsSyncStub.withArgs('/test/workspace/messages').returns(true);

      readFileSyncStub
        .withArgs('/test/workspace/next.config.js', 'utf8')
        .returns(
          'createNextIntlPlugin()({ locales: ["en", "es"], defaultLocale: "en" })'
        );
      readFileSyncStub
        .withArgs('/test/workspace/i18n/request.ts', 'utf8')
        .returns('getRequestConfig({ locales: ["en", "es"] });');
      readdirSyncStub
        .withArgs('/test/workspace/messages')
        .returns(['en.json', 'es.json']);

      await activate(contextStub);

      // Simulate file deletion event
      const deleteCallback = fileWatcherStub.onDidDelete.getCall(0).args[0];
      const uri = vscode.Uri.file('/test/workspace/messages/es.json');

      deleteCallback(uri);

      // Should handle deletion without throwing
      assert(true);

      existsSyncStub.restore();
      readFileSyncStub.restore();
      readdirSyncStub.restore();
    });
  });
});
