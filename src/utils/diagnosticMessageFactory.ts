import {MissingNestedKeys, MissingTranslation} from '../interfaces/diagnostics';

/**
 * Factory class for creating diagnostic messages
 */
export class DiagnosticMessageFactory {
  /**
   * Enum for different types of diagnostic messages
   */
  public static readonly MessageType = {
    MISSING_TRANSLATION: 'missing_translation',
    MISSING_PARENT_KEY: 'missing_parent_key',
    MISSING_NESTED_KEYS: 'missing_nested_keys',
    MISSING_PARENT_KEYS: 'missing_parent_keys'
  } as const;

  /**
   * Creates a diagnostic message based on the message type and data
   */
  public static createMessage(
    type: (typeof DiagnosticMessageFactory.MessageType)[keyof typeof DiagnosticMessageFactory.MessageType],
    data: any
  ): string {
    switch (type) {
      case DiagnosticMessageFactory.MessageType.MISSING_TRANSLATION:
        return this.createMissingTranslationMessage(data);
      case DiagnosticMessageFactory.MessageType.MISSING_PARENT_KEY:
        return this.createMissingParentKeyMessage(
          data.key,
          data.missingLocales
        );
      case DiagnosticMessageFactory.MessageType.MISSING_NESTED_KEYS:
        return this.createMissingNestedKeysMessage(data);
      case DiagnosticMessageFactory.MessageType.MISSING_PARENT_KEYS:
        return this.createMissingParentKeysMessage(data);
      default:
        throw new Error(`Unknown message type: ${type}`);
    }
  }

  /**
   * Creates a message for missing translation
   */
  private static createMissingTranslationMessage(
    missingTranslation: MissingTranslation
  ): string {
    return `Missing translations for key "${missingTranslation.key}" in:\n${Array.from(missingTranslation.missingLocales).join(', ')}`;
  }

  /**
   * Creates a message for missing parent key
   */
  private static createMissingParentKeyMessage(
    key: string,
    missingLocales: Set<string>
  ): string {
    return `Missing key "${key}" in:\n${Array.from(missingLocales).join(', ')}`;
  }

  /**
   * Creates a message for missing nested keys
   */
  private static createMissingNestedKeysMessage(
    missingNestedKeys: MissingNestedKeys
  ): string {
    const lines = [`Missing translations in "${missingNestedKeys.parentKey}":`];
    for (const [locale, keys] of missingNestedKeys.localeKeys) {
      lines.push(`${locale} - ${Array.from(keys).join(', ')}`);
    }
    return lines.join('\n');
  }

  /**
   * Creates a message for missing parent keys
   */
  private static createMissingParentKeysMessage(
    missingParentKeys: Map<string, Set<string>>
  ): string {
    const lines = ['Missing keys in this file:'];
    for (const [parentKey, locales] of missingParentKeys) {
      const localeList = Array.from(locales).join(', ');
      lines.push(`- "${parentKey}" present in: ${localeList}`);
    }
    return lines.join('\n');
  }
}
