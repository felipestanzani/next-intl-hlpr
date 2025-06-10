import {visit} from 'jsonc-parser';
/**
 * Utility class for translation key comparison operations
 */
export class TranslationComparisonUtils {
  /**
   * Compares nested keys between locales
   */
  public static compareNestedKeys(
    otherKeys: string[],
    currentKeys: string[],
    locale: string,
    missingNestedKeysByParent: Map<string, Map<string, Set<string>>>
  ): void {
    const otherParentKeys = this.groupKeysByParent(otherKeys);
    const currentParentKeys = this.groupKeysByParent(currentKeys);

    for (const [parentKey, otherNestedKeys] of otherParentKeys) {
      const currentNestedKeys = currentParentKeys.get(parentKey) || new Set();
      const missingNestedKeys = new Set<string>();

      for (const nestedKey of otherNestedKeys) {
        if (!currentNestedKeys.has(nestedKey)) {
          missingNestedKeys.add(nestedKey);
        }
      }

      if (missingNestedKeys.size > 0) {
        if (!missingNestedKeysByParent.has(parentKey)) {
          missingNestedKeysByParent.set(parentKey, new Map());
        }
        missingNestedKeysByParent
          .get(parentKey)!
          .set(locale, missingNestedKeys);
      }
    }
  }

  /**
   * Compares parent keys between locales
   */
  public static compareParentKeys(
    otherKeys: string[],
    currentKeys: string[],
    locale: string,
    missingParentKeys: Map<string, Set<string>>
  ): void {
    // Get parent keys from both files
    const currentParentKeys = Array.from(
      this.groupKeysByParent(currentKeys).keys()
    );
    const otherParentKeys = Array.from(
      this.groupKeysByParent(otherKeys).keys()
    );

    // Find parent keys that exist in other file but not in current file
    for (const parentKey of otherParentKeys) {
      if (!currentParentKeys.includes(parentKey)) {
        if (!missingParentKeys.has(parentKey)) {
          missingParentKeys.set(parentKey, new Set());
        }
        missingParentKeys.get(parentKey)!.add(locale);
      }
    }
  }

  /**
   * Groups keys by their parent key
   */
  public static groupKeysByParent(keys: string[]): Map<string, Set<string>> {
    const parentKeys = new Map<string, Set<string>>();
    for (const key of keys) {
      const keyParts = key.split('.');
      if (keyParts.length > 1) {
        const parentKey = keyParts[0];
        if (!parentKeys.has(parentKey)) {
          parentKeys.set(parentKey, new Set());
        }
        parentKeys.get(parentKey)!.add(key);
      }
    }
    return parentKeys;
  }

  /**
   * Gets all keys from an object, flattened with dot notation
   */
  public static getAllKeys(obj: any): string[] {
    const keys: string[] = [];
    const jsonString = JSON.stringify(obj, null, 2);
    visit(jsonString, {
      onObjectProperty: (
        property,
        _offset,
        _length,
        _startLine,
        _startCharacter,
        path
      ) => {
        const currentPath = path();
        const keyPath = [...currentPath, property].join('.');
        keys.push(keyPath);
      }
    });

    return keys;
  }
}
