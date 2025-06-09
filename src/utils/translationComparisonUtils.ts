import * as vscode from 'vscode';

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
    const currentParentKeys = this.extractParentKeys(currentKeys);
    const otherParentKeys = this.extractParentKeys(otherKeys);

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
   * Extracts parent keys from a list of keys
   */
  public static extractParentKeys(keys: string[]): string[] {
    const parentKeys = new Set<string>();
    for (const key of keys) {
      const keyParts = key.split('.');
      if (keyParts.length > 1) {
        parentKeys.add(keyParts[0]);
      } else {
        // Top-level keys are also parent keys
        parentKeys.add(key);
      }
    }
    return Array.from(parentKeys);
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
  public static getAllKeys(obj: any, prefix = ''): string[] {
    const keys: string[] = [];

    for (const key in obj) {
      if (Object.hasOwn(obj, key)) {
        const newPath = prefix ? `${prefix}.${key}` : key;
        if (
          typeof obj[key] === 'object' &&
          obj[key] !== null &&
          !Array.isArray(obj[key])
        ) {
          keys.push(...this.getAllKeys(obj[key], newPath));
        } else {
          keys.push(newPath);
        }
      }
    }

    return keys;
  }
}
