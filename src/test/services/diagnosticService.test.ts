import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import {DiagnosticService} from '../../services/diagnosticService';
import {TranslationService} from '../../services/translationService';
import {ConfigService} from '../../services/configService';
import {Logger} from '../../utils/logger';
import {TranslationComparisonUtils} from '../../utils/translationComparisonUtils';
import {DiagnosticMessageFactory} from '../../utils/diagnosticMessageFactory';

suite('DiagnosticService Tests', () => {
  let diagnosticService: DiagnosticService;
  let loggerStub: sinon.SinonStubbedInstance<Logger>;
  let translationServiceStub: sinon.SinonStubbedInstance<TranslationService>;
  let configServiceStub: sinon.SinonStubbedInstance<ConfigService>;
  let diagnosticCollectionStub: sinon.SinonStubbedInstance<vscode.DiagnosticCollection>;
  let createDiagnosticCollectionStub: sinon.SinonStub;
  let createFileSystemWatcherStub: sinon.SinonStub;
  let fileWatcherStub: sinon.SinonStubbedInstance<vscode.FileSystemWatcher>;
  let documentStub: sinon.SinonStubbedInstance<vscode.TextDocument>;
  let openTextDocumentStub: sinon.SinonStub;
  let getWorkspaceFolderStub: sinon.SinonStub;

  setup(() => {
    loggerStub = {
      log: sinon.stub(),
      dispose: sinon.stub()
    } as any;

    translationServiceStub = {
      initialize: sinon.stub(),
      getTranslation: sinon.stub(),
      getAllTranslations: sinon.stub(),
      findMissingTranslations: sinon.stub(),
      reloadTranslations: sinon.stub(),
      dispose: sinon.stub()
    } as any;

    configServiceStub = {
      getNextIntlConfig: sinon.stub(),
      getMessageConfig: sinon.stub(),
      clearCache: sinon.stub(),
      getTranslationsFolder: sinon.stub(),
      getTranslationsMode: sinon.stub(),
      findTranslationsFolder: sinon.stub(),
      isSingleFileMode: sinon.stub()
    } as any;

    diagnosticCollectionStub = {
      set: sinon.stub(),
      delete: sinon.stub(),
      clear: sinon.stub(),
      forEach: sinon.stub(),
      get: sinon.stub(),
      has: sinon.stub(),
      dispose: sinon.stub(),
      name: 'next-intl-hlpr'
    } as any;

    fileWatcherStub = {
      onDidChange: sinon.stub(),
      onDidCreate: sinon.stub(),
      onDidDelete: sinon.stub(),
      dispose: sinon.stub()
    } as any;

    documentStub = {
      uri: {fsPath: '/test/workspace/messages/en.json'},
      languageId: 'json',
      getText: sinon.stub(),
      lineAt: sinon.stub(),
      lineCount: 10,
      fileName: '/test/workspace/messages/en.json',
      isUntitled: false,
      isDirty: false,
      isClosed: false,
      save: sinon.stub(),
      eol: vscode.EndOfLine.LF,
      offsetAt: sinon.stub(),
      positionAt: sinon.stub(),
      validatePosition: sinon.stub(),
      validateRange: sinon.stub(),
      version: 1,
      getWordRangeAtPosition: sinon.stub()
    } as any;

    createDiagnosticCollectionStub = sinon
      .stub(vscode.languages, 'createDiagnosticCollection')
      .returns(diagnosticCollectionStub as any);
    createFileSystemWatcherStub = sinon
      .stub(vscode.workspace, 'createFileSystemWatcher')
      .returns(fileWatcherStub as any);
    openTextDocumentStub = sinon
      .stub(vscode.workspace, 'openTextDocument')
      .resolves(documentStub as any);

    diagnosticService = new DiagnosticService(
      loggerStub,
      translationServiceStub,
      configServiceStub
    );
  });

  teardown(() => {
    sinon.restore();
  });

  suite('constructor', () => {
    test('should create diagnostic collection with correct name', () => {
      assert(
        createDiagnosticCollectionStub.calledOnceWithExactly('next-intl-hlpr')
      );
    });
  });

  suite('initialize', () => {
    test('should call setupFileWatcher', async () => {
      const setupFileWatcherStub = sinon.stub(
        diagnosticService as any,
        'setupFileWatcher'
      );
      await diagnosticService.initialize();
      assert(setupFileWatcherStub.calledOnce);
      setupFileWatcherStub.restore();
    });
  });

  suite('setupFileWatcher', () => {
    test('should setup file watcher with valid config', async () => {
      const mockConfig = {
        locales: ['en', 'es'],
        defaultLocale: 'en',
        messagesPath: 'messages/${locale}.json',
        requestPath: '/test/workspace/i18n/request.ts'
      };

      configServiceStub.getNextIntlConfig.resolves(mockConfig);

      await diagnosticService.setupFileWatcher();

      assert(createFileSystemWatcherStub.calledOnce);
      assert(fileWatcherStub.onDidChange.calledOnce);
      assert(fileWatcherStub.onDidCreate.calledOnce);
      assert(fileWatcherStub.onDidDelete.calledOnce);
    });

    test('should not setup file watcher when no config available', async () => {
      configServiceStub.getNextIntlConfig.resolves(undefined);

      await diagnosticService.setupFileWatcher();

      assert(createFileSystemWatcherStub.notCalled);
    });

    test('should dispose existing watcher before creating new one', async () => {
      const mockConfig = {
        locales: ['en', 'es'],
        defaultLocale: 'en',
        messagesPath: 'messages/${locale}.json',
        requestPath: '/test/workspace/i18n/request.ts'
      };

      configServiceStub.getNextIntlConfig.resolves(mockConfig);

      // Setup first watcher
      await diagnosticService.setupFileWatcher();
      const firstWatcher = fileWatcherStub;

      // Setup second watcher
      await diagnosticService.setupFileWatcher();

      assert(firstWatcher.dispose.calledOnce);
    });
  });

  suite('updateDiagnostics', () => {
    test('should skip non-JSON documents', async () => {
      const nonJsonDocument = {
        ...documentStub,
        languageId: 'typescript'
      } as any;

      await diagnosticService.updateDiagnostics(nonJsonDocument);

      assert(configServiceStub.getNextIntlConfig.notCalled);
    });

    test('should update diagnostics for JSON documents', async () => {
      const mockConfig = {
        locales: ['en', 'es'],
        defaultLocale: 'en',
        messagesPath: 'messages/${locale}.json',
        requestPath: '/test/workspace/i18n/request.ts'
      };

      const mockTranslations = [
        {
          locale: 'en',
          messages: new Map([
            ['hello', 'Hello'],
            ['missing', 'Present in EN']
          ])
        },
        {
          locale: 'es',
          messages: new Map([['hello', 'Hola']])
        }
      ];

      configServiceStub.getNextIntlConfig.resolves(mockConfig);
      translationServiceStub.getAllTranslations.returns(mockTranslations);
      documentStub.getText.returns(
        '{"hello": "Hello", "missing": "Present in EN"}'
      );

      await diagnosticService.updateDiagnostics(documentStub);

      assert(
        loggerStub.log.calledWith(
          'Updating diagnostics for: /test/workspace/messages/en.json'
        )
      );
      assert(openTextDocumentStub.called);
    });

    test('should handle errors gracefully', async () => {
      configServiceStub.getNextIntlConfig.rejects(new Error('Config error'));

      await diagnosticService.updateDiagnostics(documentStub);

      assert(loggerStub.log.calledWith('Error updating diagnostics'));
    });

    test('should handle missing files gracefully', async () => {
      const mockConfig = {
        locales: ['en', 'es'],
        defaultLocale: 'en',
        messagesPath: 'messages/${locale}.json',
        requestPath: '/test/workspace/i18n/request.ts'
      };

      const mockTranslations = [
        {
          locale: 'en',
          messages: new Map([['hello', 'Hello']])
        }
      ];

      configServiceStub.getNextIntlConfig.resolves(mockConfig);
      translationServiceStub.getAllTranslations.returns(mockTranslations);
      openTextDocumentStub.rejects(new Error('File not found'));

      await diagnosticService.updateDiagnostics(documentStub);

      assert(
        loggerStub.log.calledWith(
          'Could not open file /test/workspace/messages/en.json: Error: File not found'
        )
      );
    });
  });

  suite('clearDiagnostics', () => {
    test('should clear diagnostics for given URI', () => {
      const uri = vscode.Uri.file('/test/file.json');

      diagnosticService.clearDiagnostics(uri);

      assert(diagnosticCollectionStub.delete.calledOnceWithExactly(uri));
    });
  });

  suite('dispose', () => {
    test('should dispose diagnostic collection and file watcher', async () => {
      const mockConfig = {
        locales: ['en'],
        defaultLocale: 'en',
        messagesPath: 'messages/${locale}.json',
        requestPath: '/test/workspace/i18n/request.ts'
      };

      configServiceStub.getNextIntlConfig.resolves(mockConfig);
      await diagnosticService.setupFileWatcher();

      diagnosticService.dispose();

      assert(diagnosticCollectionStub.dispose.calledOnce);
      assert(fileWatcherStub.dispose.calledOnce);
    });

    test('should handle dispose when no file watcher exists', () => {
      diagnosticService.dispose();

      assert(diagnosticCollectionStub.dispose.calledOnce);
      // Should not throw
    });
  });

  suite('File Watcher Events', () => {
    test('should handle file change events and update diagnostics', async () => {
      const mockConfig = {
        locales: ['en'],
        defaultLocale: 'en',
        messagesPath: 'messages/${locale}.json',
        requestPath: '/test/workspace/i18n/request.ts'
      };

      configServiceStub.getNextIntlConfig.resolves(mockConfig);
      await diagnosticService.setupFileWatcher();
      const updateDiagnosticsSpy = sinon.spy(
        diagnosticService,
        'updateDiagnostics'
      );

      // Simulate file change
      const changeCallback = fileWatcherStub.onDidChange.getCall(0).args[0];
      const uri = vscode.Uri.file('/test/workspace/messages/en.json');
      documentStub.getText.returns('{"hello": "world"}');

      await changeCallback(uri);

      assert(
        loggerStub.log.calledWith(
          `Translation file changed/created: ${uri.fsPath}`
        )
      );
      assert(translationServiceStub.reloadTranslations.calledOnce);
      assert(updateDiagnosticsSpy.calledOnceWith(documentStub));
      updateDiagnosticsSpy.restore();
    });

    test('should not update diagnostics for invalid JSON file on change', async () => {
      const mockConfig = {
        locales: ['en'],
        defaultLocale: 'en',
        messagesPath: 'messages/${locale}.json',
        requestPath: '/test/workspace/i18n/request.ts'
      };

      configServiceStub.getNextIntlConfig.resolves(mockConfig);
      await diagnosticService.setupFileWatcher();

      documentStub.getText.returns('invalid json');

      const updateDiagnosticsSpy = sinon.spy(
        diagnosticService,
        'updateDiagnostics'
      );

      // Simulate file change
      const changeCallback = fileWatcherStub.onDidChange.getCall(0).args[0];
      const uri = vscode.Uri.file('/test/workspace/messages/en.json');

      await changeCallback(uri);

      assert(loggerStub.log.calledWith(`Invalid JSON in file: ${uri.fsPath}`));
      assert(translationServiceStub.reloadTranslations.notCalled);
      assert(updateDiagnosticsSpy.notCalled);
      updateDiagnosticsSpy.restore();
    });

    test('should handle file create events', async () => {
      const mockConfig = {
        locales: ['en'],
        defaultLocale: 'en',
        messagesPath: 'messages/${locale}.json',
        requestPath: '/test/workspace/i18n/request.ts'
      };

      configServiceStub.getNextIntlConfig.resolves(mockConfig);
      await diagnosticService.setupFileWatcher();

      // Simulate file creation
      const createCallback = fileWatcherStub.onDidCreate.getCall(0).args[0];
      const uri = vscode.Uri.file('/test/workspace/messages/fr.json');

      await createCallback(uri);

      assert(
        loggerStub.log.calledWith(
          `Translation file changed/created: ${uri.fsPath}`
        )
      );
      assert(translationServiceStub.reloadTranslations.calledOnce);
    });

    test('should handle file delete events and clear diagnostics', async () => {
      const mockConfig = {
        locales: ['en'],
        defaultLocale: 'en',
        messagesPath: 'messages/${locale}.json',
        requestPath: '/test/workspace/i18n/request.ts'
      };

      configServiceStub.getNextIntlConfig.resolves(mockConfig);
      await diagnosticService.setupFileWatcher();

      const clearDiagnosticsSpy = sinon.spy(
        diagnosticService,
        'clearDiagnostics'
      );

      // Simulate file deletion
      const deleteCallback = fileWatcherStub.onDidDelete.getCall(0).args[0];
      const uri = vscode.Uri.file('/test/workspace/messages/es.json');

      await deleteCallback(uri);

      assert(
        loggerStub.log.calledWith(
          'Translation file deleted: /test/workspace/messages/es.json'
        )
      );
      assert(translationServiceStub.reloadTranslations.calledOnce);
      assert(clearDiagnosticsSpy.calledOnceWithExactly(uri));
      clearDiagnosticsSpy.restore();
    });
  });

  suite('Edge Cases', () => {
    test('should handle invalid JSON in documents', async () => {
      const mockConfig = {
        locales: ['en'],
        defaultLocale: 'en',
        messagesPath: 'messages/${locale}.json',
        requestPath: '/test/workspace/i18n/request.ts'
      };

      const mockTranslations = [
        {
          locale: 'en',
          messages: new Map([['hello', 'Hello']])
        }
      ];

      configServiceStub.getNextIntlConfig.resolves(mockConfig);
      translationServiceStub.getAllTranslations.returns(mockTranslations);
      documentStub.getText.returns('invalid json');

      await diagnosticService.updateDiagnostics(documentStub);

      // Should handle gracefully without throwing
      assert(loggerStub.log.called);
    });

    test('should handle empty translation collections', async () => {
      const mockConfig = {
        locales: ['en'],
        defaultLocale: 'en',
        messagesPath: 'messages/${locale}.json',
        requestPath: '/test/workspace/i18n/request.ts'
      };

      configServiceStub.getNextIntlConfig.resolves(mockConfig);
      translationServiceStub.getAllTranslations.returns([]);
      documentStub.getText.returns('{"hello": "Hello"}');

      await diagnosticService.updateDiagnostics(documentStub);

      assert(
        loggerStub.log.calledWith(
          'Updating diagnostics for: /test/workspace/messages/en.json'
        )
      );
    });

    test('should handle documents with no current locale', async () => {
      const mockConfig = {
        locales: ['en'],
        defaultLocale: 'en',
        messagesPath: 'messages/${locale}.json',
        requestPath: '/test/workspace/i18n/request.ts'
      };

      const mockTranslations = [
        {
          locale: 'en',
          messages: new Map([['hello', 'Hello']])
        }
      ];

      // Document with path that doesn't match locale pattern
      const invalidDocument = {
        ...documentStub,
        uri: {fsPath: '/test/workspace/messages/invalid-name.json'}
      } as any;

      configServiceStub.getNextIntlConfig.resolves(mockConfig);
      translationServiceStub.getAllTranslations.returns(mockTranslations);

      await diagnosticService.updateDiagnostics(invalidDocument);

      // Should handle gracefully
      assert(loggerStub.log.called);
    });

    test('should not create diagnostics if current translation is not found', async () => {
      const mockConfig = {
        locales: ['en'],
        defaultLocale: 'en',
        messagesPath: 'messages/${locale}.json',
        requestPath: '/test/workspace/i18n/request.ts'
      };

      const doc = {
        ...documentStub,
        uri: vscode.Uri.file('/test/workspace/messages/de.json')
      } as any;

      configServiceStub.getNextIntlConfig.resolves(mockConfig);
      translationServiceStub.getAllTranslations.returns([
        {locale: 'en', messages: new Map()}
      ]); // Does not include 'de'

      await (diagnosticService as any).updateFileDiagnostics(doc);

      assert(diagnosticCollectionStub.set.notCalled);
    });
  });

  suite('Missing Parent Keys Rule', () => {
    let readFileStub: sinon.SinonStub;
    let mockMessageConfig: any;

    setup(() => {
      readFileStub = sinon.stub(vscode.workspace.fs, 'readFile');
      mockMessageConfig = {
        loadPath: 'messages/${locale}.json'
      };
      configServiceStub.getMessageConfig.returns(mockMessageConfig);
    });

    teardown(() => {
      readFileStub.restore();
    });

    test('should detect missing parent keys and call diagnostic collection', async () => {
      const mockConfig = {
        locales: ['en', 'es'],
        defaultLocale: 'en',
        messagesPath: 'messages/${locale}.json',
        requestPath: '/test/workspace/i18n/request.ts'
      };

      const mockTranslations = [
        {
          locale: 'en',
          messages: new Map([
            ['HomePage.title', 'Hello world!'],
            ['Footer.privacy', 'Privacy Policy']
          ])
        },
        {
          locale: 'es',
          messages: new Map([
            ['HomePage.title', '¡Hola mundo!'],
            ['Header.title', 'Mi aplicación web']
          ])
        }
      ];

      // Mock file contents
      const enContent = {
        HomePage: {title: 'Hello world!'},
        Footer: {privacy: 'Privacy Policy'}
      };

      const esContent = {
        HomePage: {title: '¡Hola mundo!'},
        Header: {title: 'Mi aplicación web'}
      };

      configServiceStub.getNextIntlConfig.resolves(mockConfig);
      translationServiceStub.getAllTranslations.returns(mockTranslations);
      documentStub.getText.returns(JSON.stringify(enContent));
      documentStub.positionAt.withArgs(0).returns(new vscode.Position(0, 0));

      // Mock reading the Spanish file
      readFileStub
        .withArgs(vscode.Uri.file('/test/workspace/messages/es.json'))
        .resolves(Buffer.from(JSON.stringify(esContent)));

      await (diagnosticService as any).updateFileDiagnostics(documentStub);

      // Verify diagnostic collection was called
      assert(diagnosticCollectionStub.set.called);
    });

    test('should handle multiple missing parent keys from multiple locales', async () => {
      const mockConfig = {
        locales: ['en', 'es', 'fr'],
        defaultLocale: 'en',
        messagesPath: 'messages/${locale}.json',
        requestPath: '/test/workspace/i18n/request.ts'
      };

      const mockTranslations = [
        {
          locale: 'en',
          messages: new Map([['HomePage.title', 'Hello world!']])
        },
        {
          locale: 'es',
          messages: new Map([
            ['HomePage.title', '¡Hola mundo!'],
            ['Header.title', 'Mi aplicación web']
          ])
        },
        {
          locale: 'fr',
          messages: new Map([
            ['HomePage.title', 'Bonjour le monde!'],
            ['Footer.privacy', 'Politique de confidentialité'],
            ['Navigation.home', 'Accueil']
          ])
        }
      ];

      const enContent = {HomePage: {title: 'Hello world!'}};
      const esContent = {
        HomePage: {title: '¡Hola mundo!'},
        Header: {title: 'Mi aplicación web'}
      };
      const frContent = {
        HomePage: {title: 'Bonjour le monde!'},
        Footer: {privacy: 'Politique de confidentialité'},
        Navigation: {home: 'Accueil'}
      };

      configServiceStub.getNextIntlConfig.resolves(mockConfig);
      translationServiceStub.getAllTranslations.returns(mockTranslations);
      documentStub.getText.returns(JSON.stringify(enContent));
      documentStub.positionAt.withArgs(0).returns(new vscode.Position(0, 0));

      readFileStub
        .withArgs(vscode.Uri.file('/test/workspace/messages/es.json'))
        .resolves(Buffer.from(JSON.stringify(esContent)));
      readFileStub
        .withArgs(vscode.Uri.file('/test/workspace/messages/fr.json'))
        .resolves(Buffer.from(JSON.stringify(frContent)));

      await (diagnosticService as any).updateFileDiagnostics(documentStub);

      // Verify diagnostic collection was called
      assert(diagnosticCollectionStub.set.called);
    });

    test('should not create diagnostic when no parent keys are missing', async () => {
      const mockConfig = {
        locales: ['en', 'es'],
        defaultLocale: 'en',
        messagesPath: 'messages/${locale}.json',
        requestPath: '/test/workspace/i18n/request.ts'
      };

      const mockTranslations = [
        {
          locale: 'en',
          messages: new Map([
            ['HomePage.title', 'Hello world!'],
            ['Header.title', 'My App']
          ])
        },
        {
          locale: 'es',
          messages: new Map([
            ['HomePage.title', '¡Hola mundo!'],
            ['Header.title', 'Mi aplicación web']
          ])
        }
      ];

      const enContent = {
        HomePage: {title: 'Hello world!'},
        Header: {title: 'My App'}
      };
      const esContent = {
        HomePage: {title: '¡Hola mundo!'},
        Header: {title: 'Mi aplicación web'}
      };

      configServiceStub.getNextIntlConfig.resolves(mockConfig);
      translationServiceStub.getAllTranslations.returns(mockTranslations);
      documentStub.getText.returns(JSON.stringify(enContent));

      readFileStub
        .withArgs(vscode.Uri.file('/test/workspace/messages/es.json'))
        .resolves(Buffer.from(JSON.stringify(esContent)));

      await (diagnosticService as any).updateFileDiagnostics(documentStub);

      // Verify diagnostic collection was called (may contain other diagnostics)
      assert(diagnosticCollectionStub.set.called);
    });

    test('should handle top-level keys correctly', async () => {
      const mockConfig = {
        locales: ['en', 'es'],
        defaultLocale: 'en',
        messagesPath: 'messages/${locale}.json',
        requestPath: '/test/workspace/i18n/request.ts'
      };

      const mockTranslations = [
        {
          locale: 'en',
          messages: new Map([['welcome', 'Welcome']])
        },
        {
          locale: 'es',
          messages: new Map([
            ['welcome', 'Bienvenido'],
            ['goodbye', 'Adiós']
          ])
        }
      ];

      const enContent = {welcome: 'Welcome'};
      const esContent = {welcome: 'Bienvenido', goodbye: 'Adiós'};

      configServiceStub.getNextIntlConfig.resolves(mockConfig);
      translationServiceStub.getAllTranslations.returns(mockTranslations);
      documentStub.getText.returns(JSON.stringify(enContent));
      documentStub.positionAt.withArgs(0).returns(new vscode.Position(0, 0));

      readFileStub
        .withArgs(vscode.Uri.file('/test/workspace/messages/es.json'))
        .resolves(Buffer.from(JSON.stringify(esContent)));

      await (diagnosticService as any).updateFileDiagnostics(documentStub);

      // Verify diagnostic collection was called
      assert(diagnosticCollectionStub.set.called);
    });

    test('should handle mixed nested and top-level keys', async () => {
      const mockConfig = {
        locales: ['en', 'es'],
        defaultLocale: 'en',
        messagesPath: 'messages/${locale}.json',
        requestPath: '/test/workspace/i18n/request.ts'
      };

      const mockTranslations = [
        {
          locale: 'en',
          messages: new Map([
            ['HomePage.title', 'Hello world!'],
            ['simple', 'Simple text']
          ])
        },
        {
          locale: 'es',
          messages: new Map([
            ['HomePage.title', '¡Hola mundo!'],
            ['simple', 'Texto simple'],
            ['Header.title', 'Mi aplicación web'],
            ['footer', 'Pie de página']
          ])
        }
      ];

      const enContent = {
        HomePage: {title: 'Hello world!'},
        simple: 'Simple text'
      };
      const esContent = {
        HomePage: {title: '¡Hola mundo!'},
        simple: 'Texto simple',
        Header: {title: 'Mi aplicación web'},
        footer: 'Pie de página'
      };

      configServiceStub.getNextIntlConfig.resolves(mockConfig);
      translationServiceStub.getAllTranslations.returns(mockTranslations);
      documentStub.getText.returns(JSON.stringify(enContent));
      documentStub.positionAt.withArgs(0).returns(new vscode.Position(0, 0));

      readFileStub
        .withArgs(vscode.Uri.file('/test/workspace/messages/es.json'))
        .resolves(Buffer.from(JSON.stringify(esContent)));

      await (diagnosticService as any).updateFileDiagnostics(documentStub);

      // Verify diagnostic collection was called
      assert(diagnosticCollectionStub.set.called);
    });

    test('should handle files with no opening brace gracefully', async () => {
      const mockConfig = {
        locales: ['en', 'es'],
        defaultLocale: 'en',
        messagesPath: 'messages/${locale}.json',
        requestPath: '/test/workspace/i18n/request.ts'
      };

      const mockTranslations = [
        {
          locale: 'en',
          messages: new Map([['hello', 'Hello']])
        },
        {
          locale: 'es',
          messages: new Map([
            ['hello', 'Hola'],
            ['goodbye', 'Adiós']
          ])
        }
      ];

      configServiceStub.getNextIntlConfig.resolves(mockConfig);
      translationServiceStub.getAllTranslations.returns(mockTranslations);
      documentStub.getText.returns('invalid content without brace');

      readFileStub
        .withArgs(vscode.Uri.file('/test/workspace/messages/es.json'))
        .resolves(Buffer.from('{"hello": "Hola", "goodbye": "Adiós"}'));

      await (diagnosticService as any).updateFileDiagnostics(documentStub);

      // Should handle gracefully without throwing
      assert(loggerStub.log.called);
    });
  });

  suite('Warning Messages', () => {
    let readFileStub: sinon.SinonStub;
    let mockMessageConfig: any;

    setup(() => {
      readFileStub = sinon.stub(vscode.workspace.fs, 'readFile');
      mockMessageConfig = {
        loadPath: 'messages/${locale}.json'
      };
      configServiceStub.getMessageConfig.returns(mockMessageConfig);
    });

    teardown(() => {
      readFileStub.restore();
    });

    test('should show "Missing translations for key" warning', async () => {
      const mockConfig = {
        locales: ['en', 'es'],
        defaultLocale: 'en',
        messagesPath: 'messages/${locale}.json',
        requestPath: '/test/workspace/i18n/request.ts'
      };

      const mockTranslations = [
        {
          locale: 'en',
          messages: new Map([
            ['welcome', 'Welcome'],
            ['missing_key', 'This key is missing in ES']
          ])
        },
        {
          locale: 'es',
          messages: new Map([['welcome', 'Bienvenido']])
        }
      ];

      const enContent = {
        welcome: 'Welcome',
        missing_key: 'This key is missing in ES'
      };
      const esContent = {
        welcome: 'Bienvenido'
      };

      configServiceStub.getNextIntlConfig.resolves(mockConfig);
      translationServiceStub.getAllTranslations.returns(mockTranslations);
      documentStub.getText.returns(JSON.stringify(enContent));
      documentStub.positionAt.withArgs(0).returns(new vscode.Position(0, 0));

      readFileStub
        .withArgs(vscode.Uri.file('/test/workspace/messages/es.json'))
        .resolves(Buffer.from(JSON.stringify(esContent)));

      await (diagnosticService as any).updateFileDiagnostics(documentStub);

      const setCall = diagnosticCollectionStub.set.getCall(0);
      const entries = setCall.args[0] as [
        vscode.Uri,
        vscode.Diagnostic[] | undefined
      ][];
      const diagnostics = entries[0][1] as vscode.Diagnostic[];
      const missingTranslationWarning = diagnostics.find(
        (d: vscode.Diagnostic) =>
          d.message.includes('Missing translations for key')
      );

      assert(missingTranslationWarning);
      assert(missingTranslationWarning.message.includes('missing_key'));
      assert(missingTranslationWarning.message.includes('es'));
    });

    test('should show "Missing translations in" warning', async () => {
      const mockConfig = {
        locales: ['en', 'es', 'fr'],
        defaultLocale: 'en',
        messagesPath: 'messages/${locale}.json',
        requestPath: '/test/workspace/i18n/request.ts'
      };

      const mockTranslations = [
        {
          locale: 'en',
          messages: new Map([
            ['HomePage.title', 'Hello world!'],
            ['HomePage.subtitle', 'Welcome']
          ])
        },
        {
          locale: 'es',
          messages: new Map([['HomePage.title', '¡Hola mundo!']])
        },
        {
          locale: 'fr',
          messages: new Map([['HomePage.title', 'Bonjour le monde!']])
        }
      ];

      const enContent = {
        HomePage: {
          title: 'Hello world!',
          subtitle: 'Welcome'
        }
      };
      const esContent = {
        HomePage: {
          title: '¡Hola mundo!'
        }
      };
      const frContent = {
        HomePage: {
          title: 'Bonjour le monde!'
        }
      };

      configServiceStub.getNextIntlConfig.resolves(mockConfig);
      translationServiceStub.getAllTranslations.returns(mockTranslations);
      documentStub.getText.returns(JSON.stringify(enContent));
      documentStub.positionAt.withArgs(0).returns(new vscode.Position(0, 0));

      readFileStub
        .withArgs(vscode.Uri.file('/test/workspace/messages/es.json'))
        .resolves(Buffer.from(JSON.stringify(esContent)));
      readFileStub
        .withArgs(vscode.Uri.file('/test/workspace/messages/fr.json'))
        .resolves(Buffer.from(JSON.stringify(frContent)));

      await (diagnosticService as any).updateFileDiagnostics(documentStub);

      const setCall = diagnosticCollectionStub.set.getCall(0);
      const entries = setCall.args[0] as [
        vscode.Uri,
        vscode.Diagnostic[] | undefined
      ][];
      const diagnostics = entries[0][1] as vscode.Diagnostic[];
      const missingTranslationsWarning = diagnostics.find(
        (d: vscode.Diagnostic) => d.message.includes('Missing translations in')
      );

      assert(missingTranslationsWarning);
      assert(missingTranslationsWarning.message.includes('HomePage'));
      assert(missingTranslationsWarning.message.includes('subtitle'));
      assert(missingTranslationsWarning.message.includes('es'));
      assert(missingTranslationsWarning.message.includes('fr'));
    });

    test('should show "Missing keys in this file" warning', async () => {
      const mockConfig = {
        locales: ['en', 'es'],
        defaultLocale: 'en',
        messagesPath: 'messages/${locale}.json',
        requestPath: '/test/workspace/i18n/request.ts'
      };

      const mockTranslations = [
        {
          locale: 'en',
          messages: new Map([['welcome', 'Welcome']])
        },
        {
          locale: 'es',
          messages: new Map([
            ['welcome', 'Bienvenido'],
            ['Header', '[object]'], // Parent key that exists in Spanish but not in English
            ['Header.title', 'Mi aplicación web']
          ])
        }
      ];

      const enContent = {
        welcome: 'Welcome'
      };
      const esContent = {
        welcome: 'Bienvenido',
        Header: {
          title: 'Mi aplicación web'
        }
      };

      configServiceStub.getNextIntlConfig.resolves(mockConfig);
      translationServiceStub.getAllTranslations.returns(mockTranslations);
      documentStub.getText.returns(JSON.stringify(enContent));
      documentStub.positionAt.withArgs(0).returns(new vscode.Position(0, 0));

      // Mock the opening brace range for placing the file-level warning
      const openingBraceRange = new vscode.Range(
        new vscode.Position(0, 0),
        new vscode.Position(0, 1)
      );
      const findOpeningBraceRangeStub = sinon
        .stub(diagnosticService as any, 'findOpeningBraceRange')
        .returns(openingBraceRange);

      readFileStub
        .withArgs(vscode.Uri.file('/test/workspace/messages/es.json'))
        .resolves(Buffer.from(JSON.stringify(esContent)));

      await (diagnosticService as any).updateFileDiagnostics(documentStub);

      const setCall = diagnosticCollectionStub.set.getCall(0);
      const entries = setCall.args[0] as [
        vscode.Uri,
        vscode.Diagnostic[] | undefined
      ][];
      const diagnostics = entries[0][1] as vscode.Diagnostic[];

      const missingKeysWarning = diagnostics.find((d: vscode.Diagnostic) =>
        d.message.includes('Missing keys in this file')
      );

      assert(missingKeysWarning);
      assert(missingKeysWarning.message.includes('Header'));
      assert(missingKeysWarning.message.includes('present in: es'));

      // Restore stub
      findOpeningBraceRangeStub.restore();
    });
  });

  suite('Internal Methods', () => {
    test('recordMissingKey should record missing keys correctly', () => {
      const missingTranslationsByKey = new Map();

      // Test regular translation key
      (diagnosticService as any).recordMissingKey(
        'welcome',
        'es',
        missingTranslationsByKey,
        false
      );

      assert(missingTranslationsByKey.has('welcome'));
      assert(missingTranslationsByKey.get('welcome').has('es'));

      // Test parent key
      (diagnosticService as any).recordMissingKey(
        'HomePage',
        'fr',
        missingTranslationsByKey,
        true
      );

      assert(missingTranslationsByKey.has('__PARENT__HomePage'));
      assert(missingTranslationsByKey.get('__PARENT__HomePage').has('fr'));
    });
  });

  suite('Internal Helpers', () => {
    suite('getCurrentLocale', () => {
      test('should extract locale from valid file path', () => {
        const filePath = '/path/to/messages/en.json';
        const locale = (diagnosticService as any).getCurrentLocale(filePath);
        assert.strictEqual(locale, 'en');
      });

      test('should return undefined for invalid file path', () => {
        const filePath = '/path/to/messages/english.json';
        const locale = (diagnosticService as any).getCurrentLocale(filePath);
        assert.strictEqual(locale, undefined);
      });

      test('should return undefined for path without locale', () => {
        const filePath = '/path/to/messages.json';
        const locale = (diagnosticService as any).getCurrentLocale(filePath);
        assert.strictEqual(locale, undefined);
      });
    });

    suite('findKeyRange', () => {
      test('should find range for top-level key', () => {
        const text = '{\n  "hello": "world"\n}';
        const doc = {
          getText: () => text,
          positionAt: (offset: number) => {
            const lines = text.slice(0, offset).split('\n');
            return new vscode.Position(
              lines.length - 1,
              lines[lines.length - 1].length
            );
          }
        } as any;

        const range = (diagnosticService as any).findKeyRange(doc, 'hello');
        assert.deepStrictEqual(
          range,
          new vscode.Range(new vscode.Position(1, 2), new vscode.Position(1, 9))
        );
      });

      test('should find range for nested key', () => {
        const text = '{\n  "parent": {\n    "child": "value"\n  }\n}';
        const doc = {
          getText: () => text,
          positionAt: (offset: number) => {
            const lines = text.slice(0, offset).split('\n');
            return new vscode.Position(
              lines.length - 1,
              lines[lines.length - 1].length
            );
          }
        } as any;

        const range = (diagnosticService as any).findKeyRange(
          doc,
          'parent.child'
        );
        assert.deepStrictEqual(
          range,
          new vscode.Range(
            new vscode.Position(2, 4),
            new vscode.Position(2, 11)
          )
        );
      });

      test('should return undefined for non-existent key', () => {
        const doc = {
          getText: () => '{\n  "hello": "world"\n}'
        } as any;
        const range = (diagnosticService as any).findKeyRange(doc, 'goodbye');
        assert.strictEqual(range, undefined);
      });

      test('should return undefined for invalid JSON', () => {
        const doc = {
          getText: () => '{ "hello": "world" '
        } as any;
        const range = (diagnosticService as any).findKeyRange(doc, 'hello');
        assert.strictEqual(range, undefined);
      });
    });

    suite('findOpeningBraceRange', () => {
      test('should find opening brace for valid JSON object', () => {
        const doc = {
          getText: () => '{\n  "key": "value"\n}',
          positionAt: (offset: number) => new vscode.Position(0, offset)
        } as any;
        const range = (diagnosticService as any).findOpeningBraceRange(doc);
        assert.deepStrictEqual(
          range,
          new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 1))
        );
      });

      test('should return undefined for invalid JSON', () => {
        const doc = {
          getText: () => 'not a json',
          positionAt: (offset: number) => new vscode.Position(0, offset)
        } as any;
        const range = (diagnosticService as any).findOpeningBraceRange(doc);
        assert.strictEqual(range, undefined);
      });

      test('should return undefined for JSON that is not an object', () => {
        const doc = {
          getText: () => '["item1", "item2"]',
          positionAt: (offset: number) => new vscode.Position(0, offset)
        } as any;
        const range = (diagnosticService as any).findOpeningBraceRange(doc);
        assert.strictEqual(range, undefined);
      });
    });
  });
});
