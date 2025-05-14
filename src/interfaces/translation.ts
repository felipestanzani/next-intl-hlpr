import * as vscode from 'vscode'

export interface Translation {
  locale: string
  messages: Map<string, string>
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
  initialize(): Promise<void>
  getTranslation(locale: string): Translation | undefined
  getAllTranslations(): Translation[]
  findMissingTranslations(key: string): Promise<string[]>
  dispose(): void
}
