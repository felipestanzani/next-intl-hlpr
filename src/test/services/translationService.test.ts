import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {TranslationService} from '../../services/translationService';
import {ConfigService} from '../../services/configService';
import {Logger} from '../../utils/logger';
import {Translation} from '../../interfaces/translation';

suite('TranslationService Tests', () => {
  let translationService: TranslationService;
  let loggerStub: sinon.SinonStubbedInstance<Logger>;
  let configServiceStub: sinon.SinonStubbedInstance<ConfigService>;
  let readFileSyncStub: sinon.SinonStub;
  let readdirStub: sinon.SinonStub;
  let existsSyncStub: sinon.SinonStub;
  let createFileSystemWatcherStub: sinon.SinonStub;
  let fileWatcherStub: sinon.SinonStubbedInstance<vscode.FileSystemWatcher>;

  setup(() => {
    loggerStub = {
      log: sinon.stub(),
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

    fileWatcherStub = {
      onDidChange: sinon.stub(),
      onDidCreate: sinon.stub(),
      onDidDelete: sinon.stub(),
      dispose: sinon.stub()
    } as any;

    readFileSyncStub = sinon.stub(fs.promises, 'readFile');
    readdirStub = sinon.stub(fs.promises, 'readdir');
    existsSyncStub = sinon.stub(fs, 'existsSync');
    createFileSystemWatcherStub = sinon
      .stub(vscode.workspace, 'createFileSystemWatcher')
      .returns(fileWatcherStub as any);

    translationService = new TranslationService(loggerStub, configServiceStub);
  });

  teardown(() => {
    sinon.restore();
  });

  suite('initialize', () => {
    test('should initialize successfully with valid config', async () => {
      const mockConfig = {
        locales: ['en', 'es'],
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
      readdirStub.resolves(['en.json', 'es.json']);
      existsSyncStub.returns(true);
      readFileSyncStub
        .withArgs('/test/workspace/messages/en.json', 'utf8')
        .resolves('{"hello": "Hello", "nested": {"key": "Nested Value"}}');
      readFileSyncStub
        .withArgs('/test/workspace/messages/es.json', 'utf8')
        .resolves('{"hello": "Hola"}');

      await translationService.initialize();

      assert(configServiceStub.getNextIntlConfig.calledOnce);
      assert(loggerStub.log.calledWith('Loaded translations for 2 locales'));
    });

    test('should handle missing config gracefully', async () => {
      configServiceStub.getNextIntlConfig.resolves(undefined);

      await translationService.initialize();

      assert(loggerStub.log.calledWith('No next-intl configuration found'));
    });

    test('should handle missing message config gracefully', async () => {
      const mockConfig = {
        locales: ['en', 'es'],
        defaultLocale: 'en',
        messagesPath: 'messages/${locale}.json',
        requestPath: '/test/workspace/i18n/request.ts'
      };

      configServiceStub.getNextIntlConfig.resolves(mockConfig);
      configServiceStub.getMessageConfig.returns(undefined);

      await translationService.initialize();

      assert(loggerStub.log.calledWith('No message configuration found'));
    });

    test('should handle file read errors gracefully', async () => {
      const mockConfig = {
        locales: ['en', 'es'],
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
      readdirStub.rejects(new Error('Directory read error'));

      await translationService.initialize();

      assert(loggerStub.log.calledWith('Error loading translations'));
    });

    test('should setup file watcher', async () => {
      const mockConfig = {
        locales: ['en', 'es'],
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
      readdirStub.resolves(['en.json']);
      existsSyncStub.returns(true);
      readFileSyncStub.resolves('{"hello": "Hello"}');

      await translationService.initialize();

      assert(createFileSystemWatcherStub.calledOnce);
      assert(fileWatcherStub.onDidChange.calledOnce);
      assert(fileWatcherStub.onDidCreate.calledOnce);
    });
  });

  suite('getTranslation', () => {
    test('should return translation for existing locale', async () => {
      const mockConfig = {
        locales: ['en', 'es'],
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
      readdirStub.resolves(['en.json']);
      existsSyncStub.returns(true);
      readFileSyncStub.resolves('{"hello": "Hello"}');

      await translationService.initialize();
      const translation = translationService.getTranslation('en');

      assert(translation !== undefined);
      assert.strictEqual(translation.locale, 'en');
      assert(translation.messages.has('hello'));
    });

    test('should return undefined for non-existing locale', async () => {
      const translation = translationService.getTranslation('fr');
      assert.strictEqual(translation, undefined);
    });
  });

  suite('getAllTranslations', () => {
    test('should return all loaded translations', async () => {
      const mockConfig = {
        locales: ['en', 'es'],
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
      readdirStub.resolves(['en.json', 'es.json']);
      existsSyncStub.returns(true);
      readFileSyncStub
        .withArgs('/test/workspace/messages/en.json', 'utf8')
        .resolves('{"hello": "Hello"}');
      readFileSyncStub
        .withArgs('/test/workspace/messages/es.json', 'utf8')
        .resolves('{"hello": "Hola"}');

      await translationService.initialize();
      const translations = translationService.getAllTranslations();

      assert.strictEqual(translations.length, 2);
      assert(translations.some((t) => t.locale === 'en'));
      assert(translations.some((t) => t.locale === 'es'));
    });

    test('should return empty array when no translations loaded', () => {
      const translations = translationService.getAllTranslations();
      assert.strictEqual(translations.length, 0);
    });
  });

  suite('findMissingTranslations', () => {
    test('should find missing translations for a key', async () => {
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
      readdirStub.resolves(['en.json', 'es.json', 'fr.json']);
      existsSyncStub.returns(true);
      readFileSyncStub
        .withArgs('/test/workspace/messages/en.json', 'utf8')
        .resolves('{"hello": "Hello", "missing": "Present in EN"}');
      readFileSyncStub
        .withArgs('/test/workspace/messages/es.json', 'utf8')
        .resolves('{"hello": "Hola"}');
      readFileSyncStub
        .withArgs('/test/workspace/messages/fr.json', 'utf8')
        .resolves('{"hello": "Bonjour"}');

      await translationService.initialize();
      const missingLocales =
        await translationService.findMissingTranslations('missing');

      assert(missingLocales.includes('es'));
      assert(missingLocales.includes('fr'));
      assert(!missingLocales.includes('en'));
    });

    test('should return empty array when no config available', async () => {
      configServiceStub.getNextIntlConfig.resolves(undefined);
      configServiceStub.getMessageConfig.returns(undefined);

      const missingLocales =
        await translationService.findMissingTranslations('hello');

      assert.strictEqual(missingLocales.length, 0);
    });

    test('should handle case when current locale cannot be determined', async () => {
      const mockConfig = {
        locales: ['en', 'es'],
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

      const missingLocales =
        await translationService.findMissingTranslations('unknown.key');

      assert.strictEqual(missingLocales.length, 0);
    });
  });

  suite('reloadTranslations', () => {
    test('should reload translations successfully', async () => {
      const mockConfig = {
        locales: ['en', 'es'],
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
      readdirStub.resolves(['en.json']);
      existsSyncStub.returns(true);
      readFileSyncStub.resolves('{"hello": "Hello"}');

      await translationService.reloadTranslations();

      assert(loggerStub.log.calledWith('Reloading translations'));
    });

    test('should handle reload when no config available', async () => {
      configServiceStub.getNextIntlConfig.resolves(undefined);

      await translationService.reloadTranslations();

      assert(loggerStub.log.calledWith('No next-intl configuration found'));
    });
  });

  suite('dispose', () => {
    test('should dispose file watcher', async () => {
      const mockConfig = {
        locales: ['en'],
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
      readdirStub.resolves(['en.json']);
      existsSyncStub.returns(true);
      readFileSyncStub.resolves('{"hello": "Hello"}');

      await translationService.initialize();
      translationService.dispose();

      assert(fileWatcherStub.dispose.calledOnce);
    });

    test('should handle dispose when no file watcher exists', () => {
      translationService.dispose();
      // Should not throw
      assert(true);
    });
  });

  suite('Nested Keys', () => {
    test('should properly handle nested translation keys', async () => {
      const mockConfig = {
        locales: ['en'],
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
      readdirStub.resolves(['en.json']);
      existsSyncStub.returns(true);
      readFileSyncStub.resolves(
        '{"level1": {"level2": {"key": "Nested Value"}}}'
      );

      await translationService.initialize();
      const translation = translationService.getTranslation('en');

      assert(translation !== undefined);
      assert(translation.messages.has('level1.level2.key'));
      assert.strictEqual(
        translation.messages.get('level1.level2.key'),
        'Nested Value'
      );
    });

    test('should handle invalid JSON gracefully', async () => {
      const mockConfig = {
        locales: ['en'],
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
      readdirStub.resolves(['en.json']);
      existsSyncStub.returns(true);
      readFileSyncStub.resolves('invalid json content');

      await translationService.initialize();

      assert(loggerStub.log.calledWith('Error loading translations'));
    });
  });

  suite('Edge Cases', () => {
    test('should handle missing translation files', async () => {
      const mockConfig = {
        locales: ['en', 'es'],
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
      readdirStub.resolves(['en.json', 'es.json']);
      existsSyncStub.withArgs('/test/workspace/messages/en.json').returns(true);
      existsSyncStub
        .withArgs('/test/workspace/messages/es.json')
        .returns(false);
      readFileSyncStub
        .withArgs('/test/workspace/messages/en.json', 'utf8')
        .resolves('{"hello": "Hello"}');

      await translationService.initialize();

      assert(
        loggerStub.log.calledWith(
          'Translation file not found: /test/workspace/messages/es.json'
        )
      );
      const translations = translationService.getAllTranslations();
      assert.strictEqual(translations.length, 2); // Both locales should be loaded even if file doesn't exist
    });

    test('should handle empty message objects', async () => {
      const mockConfig = {
        locales: ['en'],
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
      readdirStub.resolves(['en.json']);
      existsSyncStub.returns(true);
      readFileSyncStub.resolves('{}');

      await translationService.initialize();
      const translation = translationService.getTranslation('en');

      assert(translation !== undefined);
      assert.strictEqual(translation.messages.size, 0);
    });
  });
});
