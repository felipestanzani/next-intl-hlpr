import * as vscode from 'vscode'

export interface Translation {
  [key: string]: string | Translation
}

export interface KeyPosition {
  key: string
  range: vscode.Range
}

export interface TranslationCache {
  translations: Map<string, Translation>
  keyPositions: KeyPosition[]
}

export interface ITranslationService {
  loadTranslations(
    translationsPath: string,
    isSingleFile: boolean,
    fileName?: string
  ): Map<string, Translation>
  findMissingTranslations(
    translations: Map<string, Translation>
  ): Map<string, string[]>
  hasKey(obj: Translation, key: string): boolean
  getAllKeys(obj: Translation, prefix?: string): string[]
}
