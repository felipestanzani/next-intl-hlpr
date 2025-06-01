import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {ConfigService} from '../../services/configService';
import {Logger} from '../../utils/logger';

suite('ConfigService Tests', () => {
  let configService: ConfigService;
  let loggerStub: sinon.SinonStubbedInstance<Logger>;
  let workspaceFoldersStub: sinon.SinonStub;
  let getConfigurationStub: sinon.SinonStub;
  let existsSyncStub: sinon.SinonStub;
  let readFileSyncStub: sinon.SinonStub;
  let readdirSyncStub: sinon.SinonStub;

  setup(() => {
    loggerStub = {
      log: sinon.stub(),
      dispose: sinon.stub()
    } as any;

    workspaceFoldersStub = sinon
      .stub(vscode.workspace, 'workspaceFolders')
      .get(() => [
        {
          uri: {fsPath: '/test/workspace'},
          name: 'test-workspace',
          index: 0
        }
      ]);

    getConfigurationStub = sinon.stub(vscode.workspace, 'getConfiguration');
    existsSyncStub = sinon.stub(fs, 'existsSync');
    readFileSyncStub = sinon.stub(fs, 'readFileSync');
    readdirSyncStub = sinon.stub(fs, 'readdirSync');

    configService = new ConfigService(loggerStub);
  });

  teardown(() => {
    sinon.restore();
  });

  suite('getNextIntlConfig', () => {
    test('should return cached config if available', async () => {
      // Setup config to be found
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

      const config1 = await configService.getNextIntlConfig();
      const config2 = await configService.getNextIntlConfig();

      assert.deepStrictEqual(config1, config2);
      assert(readFileSyncStub.calledOnce);
    });

    test('should return undefined when no workspace folders', async () => {
      workspaceFoldersStub.get(() => null);

      const config = await configService.getNextIntlConfig();

      assert.strictEqual(config, undefined);
      assert(loggerStub.log.calledWith('No workspace folders found'));
    });

    test('should return undefined when auto-detection disabled and no custom path', async () => {
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

      const config = await configService.getNextIntlConfig();

      assert.strictEqual(config, undefined);
      assert(
        loggerStub.log.calledWith(
          'Auto-detection disabled and no custom config path provided'
        )
      );
    });

    test('should find next.config with different extensions', async () => {
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

      existsSyncStub.withArgs('/test/workspace/next.config.js').returns(false);
      existsSyncStub.withArgs('/test/workspace/next.config.ts').returns(true);
      existsSyncStub.withArgs('/test/workspace/i18n/request.ts').returns(true);
      existsSyncStub.withArgs('/test/workspace/messages').returns(true);

      readFileSyncStub
        .withArgs('/test/workspace/next.config.ts', 'utf8')
        .returns(
          'createNextIntlPlugin()({ locales: ["en", "es"], defaultLocale: "en" })'
        );
      readFileSyncStub
        .withArgs('/test/workspace/i18n/request.ts', 'utf8')
        .returns('getRequestConfig({ locales: ["en", "es"] });');
      readdirSyncStub
        .withArgs('/test/workspace/messages')
        .returns(['en.json', 'es.json']);

      const config = await configService.getNextIntlConfig();

      assert(config !== undefined);
      assert(
        loggerStub.log.calledWith(
          'Found next.config at: /test/workspace/next.config.ts'
        )
      );
    });

    test('should handle error when parsing configuration', async () => {
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
      existsSyncStub.withArgs('/test/workspace/next.config.js').returns(true);
      readFileSyncStub
        .withArgs('/test/workspace/next.config.js', 'utf8')
        .throws(new Error('Parse error'));

      const config = await configService.getNextIntlConfig();

      assert.strictEqual(config, undefined);
      assert(
        loggerStub.log.calledWith('Error parsing next-intl configuration')
      );
    });
  });

  suite('detectLocales', () => {
    test('should detect locales from json files', async () => {
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
        .returns(['en.json', 'es.json', 'fr.json', 'not-json.txt']);

      const config = await configService.getNextIntlConfig();

      assert(config !== undefined);
      assert.deepStrictEqual(config.locales, ['en', 'es', 'fr']);
    });

    test('should return empty array when messages directory does not exist', async () => {
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
      existsSyncStub.withArgs('/test/workspace/next.config.js').returns(true);
      existsSyncStub.withArgs('/test/workspace/i18n/request.ts').returns(true);
      existsSyncStub.withArgs('/test/workspace/messages').returns(false);

      readFileSyncStub
        .withArgs('/test/workspace/next.config.js', 'utf8')
        .returns(
          'createNextIntlPlugin()({ locales: ["en", "es"], defaultLocale: "en" })'
        );
      readFileSyncStub
        .withArgs('/test/workspace/i18n/request.ts', 'utf8')
        .returns('getRequestConfig({ locales: ["en", "es"] });');

      const config = await configService.getNextIntlConfig();

      assert.strictEqual(config, undefined);
      assert(
        loggerStub.log.calledWith('No locale files found in messages directory')
      );
    });

    test('should handle error when reading directory', async () => {
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
        .throws(new Error('Directory read error'));

      const config = await configService.getNextIntlConfig();

      assert.strictEqual(config, undefined);
      assert(loggerStub.log.calledWith('Error detecting locales'));
    });
  });

  suite('clearCache', () => {
    test('should clear cached configuration', async () => {
      // Set up initial config
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

      await configService.getNextIntlConfig();
      configService.clearCache();
      await configService.getNextIntlConfig();

      assert(readFileSyncStub.calledTwice);
    });
  });

  suite('getMessageConfig', () => {
    test('should return cached message config', async () => {
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

      await configService.getNextIntlConfig();
      const messageConfig = configService.getMessageConfig();

      assert(messageConfig !== undefined);
    });

    test('should return undefined when no message config cached', () => {
      const messageConfig = configService.getMessageConfig();
      assert.strictEqual(messageConfig, undefined);
    });
  });

  suite('Edge Cases', () => {
    test('should handle custom config path', async () => {
      const mockConfig = {
        get: sinon
          .stub()
          .withArgs('detectConfig', true)
          .returns(true)
          .withArgs('configPath', '')
          .returns('custom/path')
          .withArgs('requestPath', '')
          .returns('')
      };
      getConfigurationStub.withArgs('nextIntlHlpr').returns(mockConfig);
      existsSyncStub
        .withArgs('/test/workspace/custom/path/next.config.js')
        .returns(true);
      existsSyncStub.withArgs('/test/workspace/i18n/request.ts').returns(true);
      existsSyncStub
        .withArgs('/test/workspace/custom/path/messages')
        .returns(true);

      readFileSyncStub
        .withArgs('/test/workspace/custom/path/next.config.js', 'utf8')
        .returns(
          'createNextIntlPlugin()({ locales: ["en", "es"], defaultLocale: "en" })'
        );
      readFileSyncStub
        .withArgs('/test/workspace/i18n/request.ts', 'utf8')
        .returns('getRequestConfig({ locales: ["en", "es"] });');
      readdirSyncStub
        .withArgs('/test/workspace/custom/path/messages')
        .returns(['en.json']);

      const config = await configService.getNextIntlConfig();

      assert(config !== undefined);
    });

    test('should handle custom request path', async () => {
      const mockConfig = {
        get: sinon
          .stub()
          .withArgs('detectConfig', true)
          .returns(true)
          .withArgs('configPath', '')
          .returns('')
          .withArgs('requestPath', '')
          .returns('custom/request.ts')
      };
      getConfigurationStub.withArgs('nextIntlHlpr').returns(mockConfig);
      existsSyncStub.withArgs('/test/workspace/next.config.js').returns(true);
      existsSyncStub
        .withArgs('/test/workspace/custom/request.ts')
        .returns(true);
      existsSyncStub.withArgs('/test/workspace/messages').returns(true);

      readFileSyncStub
        .withArgs('/test/workspace/next.config.js', 'utf8')
        .returns(
          'createNextIntlPlugin()({ locales: ["en", "es"], defaultLocale: "en" })'
        );
      readFileSyncStub
        .withArgs('/test/workspace/custom/request.ts', 'utf8')
        .returns('getRequestConfig({ locales: ["en", "es"] });');
      readdirSyncStub.withArgs('/test/workspace/messages').returns(['en.json']);

      const config = await configService.getNextIntlConfig();

      assert(config !== undefined);
    });
  });
});
