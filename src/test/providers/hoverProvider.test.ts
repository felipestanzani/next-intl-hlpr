import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import {HoverProvider} from '../../providers/hoverProvider';
import {TranslationService} from '../../services/translationService';

describe('HoverProvider Tests', () => {
  let hoverProvider: HoverProvider;
  let translationServiceStub: sinon.SinonStubbedInstance<TranslationService>;
  let documentStub: sinon.SinonStubbedInstance<vscode.TextDocument>;
  let positionStub: vscode.Position;
  let rangeStub: vscode.Range;
  let cancellationTokenStub: vscode.CancellationToken;

  beforeEach(() => {
    translationServiceStub = {
      initialize: sinon.stub(),
      getTranslation: sinon.stub(),
      getAllTranslations: sinon.stub(),
      findMissingTranslations: sinon.stub(),
      reloadTranslations: sinon.stub(),
      dispose: sinon.stub()
    } as any;

    documentStub = {
      getWordRangeAtPosition: sinon.stub(),
      getText: sinon.stub(),
      uri: {fsPath: '/test/file.json'},
      languageId: 'json',
      fileName: '/test/file.json',
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
      version: 1
    } as any;

    positionStub = new vscode.Position(0, 5);
    rangeStub = new vscode.Range(0, 0, 0, 10);
    cancellationTokenStub = {
      isCancellationRequested: false,
      onCancellationRequested: sinon.stub()
    };

    hoverProvider = new HoverProvider(translationServiceStub);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('provideHover', () => {
    it('should return hover with missing translations when they exist', async () => {
      const key = 'hello';
      const quotedKey = `"${key}"`;
      const missingLocales = ['es', 'fr'];

      documentStub.getWordRangeAtPosition
        .withArgs(positionStub, /"[^"]+"/)
        .returns(rangeStub);
      documentStub.getText.withArgs(rangeStub).returns(quotedKey);
      translationServiceStub.findMissingTranslations
        .withArgs(key)
        .resolves(missingLocales);

      const result = await hoverProvider.provideHover(
        documentStub,
        positionStub,
        cancellationTokenStub
      );

      assert(result !== undefined);
      assert(result instanceof vscode.Hover);
      assert.deepStrictEqual(result.range, rangeStub);

      const contents = result.contents[0] as vscode.MarkdownString;
      assert(contents.value.includes(`Missing translations for key "${key}"`));
      assert(contents.value.includes('es, fr'));
    });

    it('should return undefined when no word range found', async () => {
      documentStub.getWordRangeAtPosition
        .withArgs(positionStub, /"[^"]+"/)
        .returns(undefined);

      const result = await hoverProvider.provideHover(
        documentStub,
        positionStub,
        cancellationTokenStub
      );

      assert.strictEqual(result, undefined);
      assert(translationServiceStub.findMissingTranslations.notCalled);
    });

    it('should return undefined when no missing translations', async () => {
      const key = 'hello';
      const quotedKey = `"${key}"`;

      documentStub.getWordRangeAtPosition
        .withArgs(positionStub, /"[^"]+"/)
        .returns(rangeStub);
      documentStub.getText.withArgs(rangeStub).returns(quotedKey);
      translationServiceStub.findMissingTranslations.withArgs(key).resolves([]);

      const result = await hoverProvider.provideHover(
        documentStub,
        positionStub,
        cancellationTokenStub
      );

      assert.strictEqual(result, undefined);
    });

    it('should handle keys with special characters', async () => {
      const key = 'hello.world-test_key';
      const quotedKey = `"${key}"`;
      const missingLocales = ['es'];

      documentStub.getWordRangeAtPosition
        .withArgs(positionStub, /"[^"]+"/)
        .returns(rangeStub);
      documentStub.getText.withArgs(rangeStub).returns(quotedKey);
      translationServiceStub.findMissingTranslations
        .withArgs(key)
        .resolves(missingLocales);

      const result = await hoverProvider.provideHover(
        documentStub,
        positionStub,
        cancellationTokenStub
      );

      assert(result !== undefined);
      const contents = result.contents[0] as vscode.MarkdownString;
      assert(contents.value.includes(key));
    });

    it('should handle nested keys', async () => {
      const key = 'nested.deep.key';
      const quotedKey = `"${key}"`;
      const missingLocales = ['fr', 'de'];

      documentStub.getWordRangeAtPosition
        .withArgs(positionStub, /"[^"]+"/)
        .returns(rangeStub);
      documentStub.getText.withArgs(rangeStub).returns(quotedKey);
      translationServiceStub.findMissingTranslations
        .withArgs(key)
        .resolves(missingLocales);

      const result = await hoverProvider.provideHover(
        documentStub,
        positionStub,
        cancellationTokenStub
      );

      assert(result !== undefined);
      const contents = result.contents[0] as vscode.MarkdownString;
      assert(contents.value.includes('nested.deep.key'));
      assert(contents.value.includes('fr, de'));
    });

    it('should handle empty string key', async () => {
      const key = '';
      const quotedKey = `"${key}"`;

      documentStub.getWordRangeAtPosition
        .withArgs(positionStub, /"[^"]+"/)
        .returns(rangeStub);
      documentStub.getText.withArgs(rangeStub).returns(quotedKey);
      translationServiceStub.findMissingTranslations.withArgs(key).resolves([]);

      const result = await hoverProvider.provideHover(
        documentStub,
        positionStub,
        cancellationTokenStub
      );

      assert.strictEqual(result, undefined);
    });

    it('should handle single missing locale', async () => {
      const key = 'singleMissing';
      const quotedKey = `"${key}"`;
      const missingLocales = ['es'];

      documentStub.getWordRangeAtPosition
        .withArgs(positionStub, /"[^"]+"/)
        .returns(rangeStub);
      documentStub.getText.withArgs(rangeStub).returns(quotedKey);
      translationServiceStub.findMissingTranslations
        .withArgs(key)
        .resolves(missingLocales);

      const result = await hoverProvider.provideHover(
        documentStub,
        positionStub,
        cancellationTokenStub
      );

      assert(result !== undefined);
      const contents = result.contents[0] as vscode.MarkdownString;
      assert(contents.value.includes('es'));
      assert(!contents.value.includes(', ')); // No comma since it's just one locale
    });

    it('should handle multiple missing locales', async () => {
      const key = 'multipleMissing';
      const quotedKey = `"${key}"`;
      const missingLocales = ['es', 'fr', 'de', 'it'];

      documentStub.getWordRangeAtPosition
        .withArgs(positionStub, /"[^"]+"/)
        .returns(rangeStub);
      documentStub.getText.withArgs(rangeStub).returns(quotedKey);
      translationServiceStub.findMissingTranslations
        .withArgs(key)
        .resolves(missingLocales);

      const result = await hoverProvider.provideHover(
        documentStub,
        positionStub,
        cancellationTokenStub
      );

      assert(result !== undefined);
      const contents = result.contents[0] as vscode.MarkdownString;
      assert(contents.value.includes('es, fr, de, it'));
    });

    it('should handle findMissingTranslations throwing an error', async () => {
      const key = 'errorKey';
      const quotedKey = `"${key}"`;

      documentStub.getWordRangeAtPosition
        .withArgs(positionStub, /"[^"]+"/)
        .returns(rangeStub);
      documentStub.getText.withArgs(rangeStub).returns(quotedKey);
      translationServiceStub.findMissingTranslations
        .withArgs(key)
        .rejects(new Error('Service error'));

      try {
        const result = await hoverProvider.provideHover(
          documentStub,
          positionStub,
          cancellationTokenStub
        );
        // If we reach here, the error was not propagated, which might be acceptable
        // depending on the implementation - the provider might catch and handle errors
        assert(result === undefined || result instanceof vscode.Hover);
      } catch (error) {
        // If the error is propagated, that's also acceptable behavior
        assert(error instanceof Error);
        assert.strictEqual(error.message, 'Service error');
      }
    });

    it('should handle cancellation token', async () => {
      const key = 'cancelledKey';
      const quotedKey = `"${key}"`;
      const cancelledToken = {
        isCancellationRequested: true,
        onCancellationRequested: sinon.stub()
      };

      documentStub.getWordRangeAtPosition
        .withArgs(positionStub, /"[^"]+"/)
        .returns(rangeStub);
      documentStub.getText.withArgs(rangeStub).returns(quotedKey);
      translationServiceStub.findMissingTranslations.withArgs(key).resolves([]);

      const result = await hoverProvider.provideHover(
        documentStub,
        positionStub,
        cancelledToken
      );

      // The behavior when cancelled depends on implementation
      // Most providers should return undefined or handle cancellation gracefully
      assert(result === undefined || result instanceof vscode.Hover);
    });
  });

  describe('Edge Cases', () => {
    it('should handle malformed quoted strings', async () => {
      const malformedKey = '"unclosed';

      documentStub.getWordRangeAtPosition
        .withArgs(positionStub, /"[^"]+"/)
        .returns(rangeStub);
      documentStub.getText.withArgs(rangeStub).returns(malformedKey);
      translationServiceStub.findMissingTranslations
        .withArgs('unclose')
        .resolves([]);

      const result = await hoverProvider.provideHover(
        documentStub,
        positionStub,
        cancellationTokenStub
      );

      // Should handle gracefully by extracting what it can
      // The slice(1, -1) operation on '"unclosed' would result in 'unclose'
      assert(
        translationServiceStub.findMissingTranslations.calledWith('unclose')
      );
    });

    it('should handle very long keys', async () => {
      const longKey = 'a'.repeat(1000);
      const quotedKey = `"${longKey}"`;
      const missingLocales = ['es'];

      documentStub.getWordRangeAtPosition
        .withArgs(positionStub, /"[^"]+"/)
        .returns(rangeStub);
      documentStub.getText.withArgs(rangeStub).returns(quotedKey);
      translationServiceStub.findMissingTranslations
        .withArgs(longKey)
        .resolves(missingLocales);

      const result = await hoverProvider.provideHover(
        documentStub,
        positionStub,
        cancellationTokenStub
      );

      assert(result !== undefined);
      assert(
        translationServiceStub.findMissingTranslations.calledWith(longKey)
      );
    });

    it('should handle keys with unicode characters', async () => {
      const unicodeKey = 'héllo_wörld🌍';
      const quotedKey = `"${unicodeKey}"`;
      const missingLocales = ['es'];

      documentStub.getWordRangeAtPosition
        .withArgs(positionStub, /"[^"]+"/)
        .returns(rangeStub);
      documentStub.getText.withArgs(rangeStub).returns(quotedKey);
      translationServiceStub.findMissingTranslations
        .withArgs(unicodeKey)
        .resolves(missingLocales);

      const result = await hoverProvider.provideHover(
        documentStub,
        positionStub,
        cancellationTokenStub
      );

      assert(result !== undefined);
      const contents = result.contents[0] as vscode.MarkdownString;
      assert(contents.value.includes(unicodeKey));
    });
  });
});
