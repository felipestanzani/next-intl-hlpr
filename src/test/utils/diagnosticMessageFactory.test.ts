import * as assert from 'assert';
import {DiagnosticMessageFactory} from '../../utils/diagnosticMessageFactory';

suite('DiagnosticMessageFactory Tests', () => {
  test('should create missing translation message', () => {
    const message = DiagnosticMessageFactory.createMessage(
      DiagnosticMessageFactory.MessageType.MISSING_TRANSLATION,
      {
        key: 'welcome',
        missingLocales: new Set(['es', 'fr']),
        isParentKey: false
      }
    );

    assert(message.includes('Missing translations for key "welcome" in:'));
    assert(message.includes('es'));
    assert(message.includes('fr'));
  });

  test('should create missing parent key message', () => {
    const message = DiagnosticMessageFactory.createMessage(
      DiagnosticMessageFactory.MessageType.MISSING_PARENT_KEY,
      {
        key: 'HomePage',
        missingLocales: new Set(['es', 'fr'])
      }
    );

    assert(message.includes('Missing key "HomePage" in:'));
    assert(message.includes('es'));
    assert(message.includes('fr'));
  });

  test('should create missing nested keys message', () => {
    const localeKeys = new Map<string, Set<string>>();
    localeKeys.set('es', new Set(['HomePage.title', 'HomePage.subtitle']));
    localeKeys.set('fr', new Set(['HomePage.description']));

    const message = DiagnosticMessageFactory.createMessage(
      DiagnosticMessageFactory.MessageType.MISSING_NESTED_KEYS,
      {
        parentKey: 'HomePage',
        localeKeys
      }
    );

    assert(message.includes('Missing translations in "HomePage":'));
    assert(message.includes('es - HomePage.title, HomePage.subtitle'));
    assert(message.includes('fr - HomePage.description'));
  });

  test('should create missing parent keys message', () => {
    const missingParentKeys = new Map<string, Set<string>>();
    missingParentKeys.set('Header', new Set(['es', 'fr']));
    missingParentKeys.set('Footer', new Set(['de']));

    const message = DiagnosticMessageFactory.createMessage(
      DiagnosticMessageFactory.MessageType.MISSING_PARENT_KEYS,
      missingParentKeys
    );

    assert(message.includes('Missing keys in this file:'));
    assert(message.includes('- "Header" present in: es, fr'));
    assert(message.includes('- "Footer" present in: de'));
  });

  test('should throw error for unknown message type', () => {
    assert.throws(() => {
      DiagnosticMessageFactory.createMessage('unknown_type' as any, {});
    }, /Unknown message type/);
  });
});
