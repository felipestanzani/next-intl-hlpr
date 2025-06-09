import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import {TranslationComparisonUtils} from '../../utils/translationComparisonUtils';

suite('TranslationComparisonUtils Tests', () => {
  test('getAllKeys should extract keys correctly', () => {
    const input = {
      simple: 'Simple value',
      nested: {
        key1: 'Value 1',
        key2: 'Value 2',
        deeper: {
          key3: 'Value 3'
        }
      }
    };

    const result = TranslationComparisonUtils.getAllKeys(input);

    // Expected flattened keys
    const expected = [
      'simple',
      'nested.key1',
      'nested.key2',
      'nested.deeper.key3'
    ].sort();

    assert.deepStrictEqual(result.sort(), expected);
  });

  test('extractParentKeys should extract parent keys correctly', () => {
    const keys = [
      'HomePage.title',
      'HomePage.subtitle',
      'Footer.copyright',
      'simple'
    ];

    const result = TranslationComparisonUtils.extractParentKeys(keys);

    assert.deepStrictEqual(
      result.sort(),
      ['HomePage', 'Footer', 'simple'].sort()
    );
  });

  test('groupKeysByParent should group keys by parent', () => {
    const keys = [
      'HomePage.title',
      'HomePage.subtitle',
      'Footer.copyright',
      'simple'
    ];

    const result = TranslationComparisonUtils.groupKeysByParent(keys);

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

    TranslationComparisonUtils.compareNestedKeys(
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

    TranslationComparisonUtils.compareParentKeys(
      otherKeys,
      currentKeys,
      locale,
      missingParentKeys
    );

    assert(missingParentKeys.has('Header'));
    const locales = missingParentKeys.get('Header');
    assert(locales.has('es'));
  });
});
