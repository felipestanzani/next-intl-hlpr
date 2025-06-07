import * as vscode from 'vscode';

/**
 * Represents missing translations in a locale
 */
export interface MissingTranslation {
  key: string;
  missingLocales: Set<string>;
  isParentKey: boolean;
}

/**
 * Represents missing nested keys in a parent key
 */
export interface MissingNestedKeys {
  parentKey: string;
  localeKeys: Map<string, Set<string>>;
}

/**
 * Represents missing parent keys in a locale
 */
export interface MissingParentKey {
  parentKey: string;
  locales: Set<string>;
}

/**
 * Contains all diagnostic information for a locale file
 */
export interface DiagnosticInfo {
  missingNestedKeysByParent: Map<string, Map<string, Set<string>>>;
  missingTranslationsByKey: Map<string, Set<string>>;
  missingParentKeys: Map<string, Set<string>>;
}

/**
 * Represents a KeyRange with position information
 */
export interface KeyRange {
  key: string;
  range: vscode.Range;
}
