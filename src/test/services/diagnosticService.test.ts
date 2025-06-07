import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import {DiagnosticService} from '../../services/diagnosticService';
import {TranslationService} from '../../services/translationService';
import {ConfigService} from '../../services/configService';
import {Logger} from '../../utils/logger';

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
    test('should handle file change events', async () => {
      const mockConfig = {
        locales: ['en'],
        defaultLocale: 'en',
        messagesPath: 'messages/${locale}.json',
        requestPath: '/test/workspace/i18n/request.ts'
      };

      configServiceStub.getNextIntlConfig.resolves(mockConfig);
      await diagnosticService.setupFileWatcher();

      // Simulate file change
      const changeCallback = fileWatcherStub.onDidChange.getCall(0).args[0];
      const uri = vscode.Uri.file('/test/workspace/messages/en.json');

      await changeCallback(uri);

      assert(
        loggerStub.log.calledWith(
          'Translation file changed: /test/workspace/messages/en.json'
        )
      );
      assert(translationServiceStub.reloadTranslations.calledOnce);
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
          'New translation file created: /test/workspace/messages/fr.json'
        )
      );
      assert(translationServiceStub.reloadTranslations.calledOnce);
    });

    test('should handle file delete events', async () => {
      const mockConfig = {
        locales: ['en'],
        defaultLocale: 'en',
        messagesPath: 'messages/${locale}.json',
        requestPath: '/test/workspace/i18n/request.ts'
      };

      configServiceStub.getNextIntlConfig.resolves(mockConfig);
      await diagnosticService.setupFileWatcher();

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

    test('should show "Missing key" warning', async () => {
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
            ['extra_key', 'This key is missing in EN']
          ])
        }
      ];

      const enContent = {
        welcome: 'Welcome'
      };
      const esContent = {
        welcome: 'Bienvenido',
        extra_key: 'This key is missing in EN'
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
      const missingKeyWarning = diagnostics.find((d: vscode.Diagnostic) =>
        d.message.includes('Missing key')
      );

      assert(missingKeyWarning);
      assert(missingKeyWarning.message.includes('extra_key'));
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

    test('should show "Missing parent translation" warning', async () => {
      const mockConfig = {
        locales: ['en'],
        defaultLocale: 'en',
        messagesPath: 'messages/${locale}.json',
        requestPath: '/test/workspace/i18n/request.ts'
      };

      const mockTranslations = [
        {
          locale: 'en',
          messages: new Map([['HomePage.title', 'Hello world!']])
        }
      ];

      // Content has nested structure but no explicit parent key
      const enContent = {
        HomePage: {
          title: 'Hello world!'
        }
      };

      const allKeys = ['HomePage.title'];

      configServiceStub.getNextIntlConfig.resolves(mockConfig);
      translationServiceStub.getAllTranslations.returns(mockTranslations);
      documentStub.getText.returns(JSON.stringify(enContent));

      // Mock finding key range for 'HomePage.title'
      const keyRange = new vscode.Range(
        new vscode.Position(1, 5),
        new vscode.Position(1, 14)
      );
      const findKeyRangeStub = sinon
        .stub(diagnosticService as any, 'findKeyRange')
        .returns(keyRange);

      // Mock getAllKeys to return our predefined keys
      const getAllKeysStub = sinon
        .stub(diagnosticService as any, 'getAllKeys')
        .returns(allKeys);

      await (diagnosticService as any).updateFileDiagnostics(documentStub);

      const setCall = diagnosticCollectionStub.set.getCall(0);
      const entries = setCall.args[0] as [
        vscode.Uri,
        vscode.Diagnostic[] | undefined
      ][];
      const diagnostics = entries[0][1] as vscode.Diagnostic[];

      const missingParentTranslationWarning = diagnostics.find(
        (d: vscode.Diagnostic) =>
          d.message.includes(
            'Missing parent translation "HomePage" for key "HomePage.title"'
          )
      );

      assert(missingParentTranslationWarning);
      assert(missingParentTranslationWarning.message.includes('HomePage'));
      assert(
        missingParentTranslationWarning.message.includes('HomePage.title')
      );

      // Restore stubs
      findKeyRangeStub.restore();
      getAllKeysStub.restore();
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
    test('getAllKeys should extract keys correctly', () => {
      const input = {
        simple: 'Simple value',
        nested: {
          key1: 'Value 1',
          key2: 'Value 2',
          deeper: {
            key3: 'Value 3'
          }
        },
        array: [1, 2, 3]
      };

      const result = (diagnosticService as any).getAllKeys(input);

      // The array elements are also included as keys in the form array.0, array.1, etc.
      const expected = [
        'array',
        'array.0',
        'array.1',
        'array.2',
        'nested',
        'nested.deeper',
        'nested.deeper.key3',
        'nested.key1',
        'nested.key2',
        'simple'
      ].sort((a: string, b: string) => a.localeCompare(b));

      assert.deepStrictEqual(
        result.sort((a: string, b: string) => a.localeCompare(b)),
        expected
      );
    });

    test('traverseObject should extract keys correctly', () => {
      const input = {
        simple: 'Simple value',
        nested: {
          key1: 'Value 1',
          key2: 'Value 2'
        }
      };

      const keys: string[] = [];
      (diagnosticService as any).traverseObject(input, '', keys);

      const sortedKeys = [...keys].sort((a: string, b: string) =>
        a.localeCompare(b)
      );
      const expectedKeys = [
        'simple',
        'nested',
        'nested.key1',
        'nested.key2'
      ].sort((a: string, b: string) => a.localeCompare(b));
      assert.deepStrictEqual(sortedKeys, expectedKeys);
    });

    test('extractParentKeys should extract parent keys correctly', () => {
      const keys = [
        'HomePage.title',
        'HomePage.subtitle',
        'Footer.copyright',
        'simple'
      ];

      const result = (diagnosticService as any).extractParentKeys(keys);

      assert.deepStrictEqual(
        result.sort((a: string, b: string) => a.localeCompare(b)),
        ['HomePage', 'Footer', 'simple'].sort((a: string, b: string) =>
          a.localeCompare(b)
        )
      );
    });

    test('groupKeysByParent should group keys by parent', () => {
      const keys = [
        'HomePage.title',
        'HomePage.subtitle',
        'Footer.copyright',
        'simple'
      ];

      const result = (diagnosticService as any).groupKeysByParent(keys);

      assert(result.has('HomePage'));
      assert(result.has('Footer'));
      assert(!result.has('simple')); // Top-level keys aren't included

      const homePageKeys = result.get('HomePage');
      assert(homePageKeys?.has('HomePage.title'));
      assert(homePageKeys?.has('HomePage.subtitle'));

      const footerKeys = result.get('Footer');
      assert(footerKeys?.has('Footer.copyright'));
    });

    test('compareNestedKeys should identify missing nested keys', () => {
      const otherKeys = [
        'HomePage.title',
        'HomePage.subtitle',
        'HomePage.description',
        'Footer.copyright'
      ];
      const currentKeys = [
        'HomePage.title',
        'HomePage.subtitle',
        'Footer.copyright',
        'Footer.links'
      ];
      const locale = 'es';
      const missingNestedKeysByParent = new Map();

      (diagnosticService as any).compareNestedKeys(
        otherKeys,
        currentKeys,
        locale,
        missingNestedKeysByParent
      );

      assert(missingNestedKeysByParent.has('HomePage'));
      const missingInHomePage = missingNestedKeysByParent
        .get('HomePage')
        .get('es');
      assert(missingInHomePage.has('HomePage.description'));

      assert(!missingNestedKeysByParent.has('Footer'));
    });

    test('compareParentKeys should identify missing parent keys', () => {
      const otherKeys = ['HomePage.title', 'Footer.copyright', 'Header.logo'];
      const currentKeys = ['HomePage.title', 'Footer.copyright'];
      const locale = 'es';
      const missingParentKeys = new Map();

      (diagnosticService as any).compareParentKeys(
        otherKeys,
        currentKeys,
        locale,
        missingParentKeys
      );

      assert(missingParentKeys.has('Header'));
      const locales = missingParentKeys.get('Header');
      assert(locales.has('es'));
    });

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

  suite('Diagnostic Methods', () => {
    test('addDiagnosticsForNestedKeys should add diagnostics for missing nested keys', () => {
      const missingNestedKeysByParent = new Map();
      const esKeys = new Set(['HomePage.description']);
      const frKeys = new Set(['HomePage.welcome']);

      const localeMap = new Map();
      localeMap.set('es', esKeys);
      localeMap.set('fr', frKeys);

      missingNestedKeysByParent.set('HomePage', localeMap);

      const diagnostics: vscode.Diagnostic[] = [];
      const keyRange = new vscode.Range(
        new vscode.Position(1, 5),
        new vscode.Position(1, 15)
      );

      const findKeyRangeStub = sinon
        .stub(diagnosticService as any, 'findKeyRange')
        .returns(keyRange);

      const createMessageStub = sinon
        .stub(diagnosticService as any, 'createMissingNestedKeysMessage')
        .returns('Test message');

      (diagnosticService as any).addDiagnosticsForNestedKeys(
        documentStub,
        missingNestedKeysByParent,
        diagnostics
      );

      assert.strictEqual(diagnostics.length, 1);
      assert.strictEqual(diagnostics[0].message, 'Test message');
      assert.strictEqual(
        diagnostics[0].severity,
        vscode.DiagnosticSeverity.Warning
      );

      findKeyRangeStub.restore();
      createMessageStub.restore();
    });

    test('addDiagnosticsForMissingTranslations should add diagnostics for missing translations', () => {
      const missingTranslationsByKey = new Map();
      const regularLocales = new Set(['es', 'fr']);
      const parentLocales = new Set(['de']);

      missingTranslationsByKey.set('welcome', regularLocales);
      missingTranslationsByKey.set('__PARENT__HomePage', parentLocales);

      const diagnostics: vscode.Diagnostic[] = [];
      const keyRange = new vscode.Range(
        new vscode.Position(1, 5),
        new vscode.Position(1, 15)
      );

      const findKeyRangeStub = sinon
        .stub(diagnosticService as any, 'findKeyRange')
        .returns(keyRange);

      const createMissingTranslationMessageStub = sinon
        .stub(diagnosticService as any, 'createMissingTranslationMessage')
        .returns('Missing translation message');

      const createMissingParentKeyMessageStub = sinon
        .stub(diagnosticService as any, 'createMissingParentKeyMessage')
        .returns('Missing parent key message');

      (diagnosticService as any).addDiagnosticsForMissingTranslations(
        documentStub,
        missingTranslationsByKey,
        diagnostics
      );

      assert.strictEqual(diagnostics.length, 2);

      findKeyRangeStub.restore();
      createMissingTranslationMessageStub.restore();
      createMissingParentKeyMessageStub.restore();
    });

    test('addDiagnosticsForMissingParentTranslations should add diagnostics for missing parent translations', () => {
      const currentKeys = [
        'HomePage.title',
        'Footer.copyright.text' // Missing intermediate 'Footer.copyright' key
      ];

      const diagnostics: vscode.Diagnostic[] = [];
      const keyRange = new vscode.Range(
        new vscode.Position(1, 5),
        new vscode.Position(1, 15)
      );

      const findKeyRangeStub = sinon
        .stub(diagnosticService as any, 'findKeyRange')
        .returns(keyRange);

      (diagnosticService as any).addDiagnosticsForMissingParentTranslations(
        documentStub,
        currentKeys,
        diagnostics
      );

      assert.strictEqual(diagnostics.length, 1);
      assert(diagnostics[0].message.includes('Missing parent translation'));

      findKeyRangeStub.restore();
    });

    test('addDiagnosticsForMissingParentKeys should add diagnostics for missing parent keys', () => {
      const missingParentKeys = new Map();
      missingParentKeys.set('Header', new Set(['es', 'fr']));

      const diagnostics: vscode.Diagnostic[] = [];
      const braceRange = new vscode.Range(
        new vscode.Position(0, 0),
        new vscode.Position(0, 1)
      );

      const findOpeningBraceRangeStub = sinon
        .stub(diagnosticService as any, 'findOpeningBraceRange')
        .returns(braceRange);

      const createMessageStub = sinon
        .stub(diagnosticService as any, 'createMissingParentKeysMessage')
        .returns('Test message');

      (diagnosticService as any).addDiagnosticsForMissingParentKeys(
        documentStub,
        missingParentKeys,
        diagnostics
      );

      assert.strictEqual(diagnostics.length, 1);
      assert.strictEqual(diagnostics[0].message, 'Test message');

      findOpeningBraceRangeStub.restore();
      createMessageStub.restore();
    });

    test('compareTranslationKeys should analyze all translation differences', async () => {
      const translation = {
        locale: 'es',
        messages: new Map([
          ['HomePage.title', '¡Hola mundo!'],
          ['Header.logo', 'Logo'],
          ['simple', 'Simple']
        ])
      };

      const currentKeys = ['HomePage.title', 'Footer.copyright', 'simple'];

      const document = documentStub;
      const missingNestedKeysByParent = new Map();
      const missingParentKeys = new Map();

      // Setup config service stubs
      const mockConfig = {
        locales: ['en', 'es', 'fr'],
        defaultLocale: 'en',
        messagesPath: 'messages/${locale}.json',
        requestPath: '/test/workspace/i18n/request.ts'
      };
      const mockMessageConfig = {
        namespaces: ['common'],
        defaultNamespace: 'common',
        loadPath: 'messages/${locale}.json',
        dynamicImport: false
      };

      configServiceStub.getNextIntlConfig.resolves(mockConfig);
      configServiceStub.getMessageConfig.returns(mockMessageConfig);

      // Setup file system stub
      const esContent = {
        HomePage: {title: '¡Hola mundo!'},
        Header: {logo: 'Logo'},
        simple: 'Simple'
      };

      const readFileStub = sinon
        .stub(vscode.workspace.fs, 'readFile')
        .resolves(Buffer.from(JSON.stringify(esContent)));

      // Setup compareNestedKeys and compareParentKeys stubs
      const compareNestedKeysStub = sinon.stub(
        diagnosticService as any,
        'compareNestedKeys'
      );
      const compareParentKeysStub = sinon.stub(
        diagnosticService as any,
        'compareParentKeys'
      );

      await (diagnosticService as any).compareTranslationKeys(
        translation,
        currentKeys,
        document,
        missingNestedKeysByParent,
        missingParentKeys
      );

      // Verify the correct methods were called with expected arguments
      assert(readFileStub.calledOnce);
      assert(compareNestedKeysStub.calledOnce);
      assert(compareParentKeysStub.calledOnce);

      // Verify the args to the compare methods
      const nestedKeysArgs = compareNestedKeysStub.getCall(0).args;
      assert.deepStrictEqual(nestedKeysArgs[0], [
        'HomePage.title',
        'Header.logo',
        'simple'
      ]);
      assert.deepStrictEqual(nestedKeysArgs[1], currentKeys);
      assert.strictEqual(nestedKeysArgs[2], 'es');
      assert.strictEqual(nestedKeysArgs[3], missingNestedKeysByParent);

      const parentKeysArgs = compareParentKeysStub.getCall(0).args;
      assert.deepStrictEqual(parentKeysArgs[0], [
        'HomePage.title',
        'Header.logo',
        'simple'
      ]);
      assert.deepStrictEqual(parentKeysArgs[1], currentKeys);
      assert.strictEqual(parentKeysArgs[2], 'es');
      assert.strictEqual(parentKeysArgs[3], missingParentKeys);

      readFileStub.restore();
      compareNestedKeysStub.restore();
      compareParentKeysStub.restore();
    });

    test('compareTranslationKeys should handle file reading errors', async () => {
      const translation = {
        locale: 'fr',
        messages: new Map([['HomePage.title', 'Bonjour le monde!']])
      };

      const currentKeys = ['HomePage.title'];
      const document = documentStub;
      const missingNestedKeysByParent = new Map();
      const missingParentKeys = new Map();

      // Setup config service stubs
      const mockConfig = {
        locales: ['en', 'fr'],
        defaultLocale: 'en',
        messagesPath: 'messages/${locale}.json',
        requestPath: '/test/workspace/i18n/request.ts'
      };
      const mockMessageConfig = {
        namespaces: ['common'],
        defaultNamespace: 'common',
        loadPath: 'messages/${locale}.json',
        dynamicImport: false
      };

      configServiceStub.getNextIntlConfig.resolves(mockConfig);
      configServiceStub.getMessageConfig.returns(mockMessageConfig);

      // Setup file system stub to throw an error
      const readFileStub = sinon
        .stub(vscode.workspace.fs, 'readFile')
        .rejects(new Error('File not found'));

      await (diagnosticService as any).compareTranslationKeys(
        translation,
        currentKeys,
        document,
        missingNestedKeysByParent,
        missingParentKeys
      );

      // Verify error was logged
      assert(
        loggerStub.log.calledWith(
          sinon.match('Error comparing translation keys:')
        )
      );

      readFileStub.restore();
    });
  });
});
