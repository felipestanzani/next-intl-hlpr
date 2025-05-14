import * as vscode from 'vscode'
import { TranslationService } from '../services/translationService'

export class HoverProvider implements vscode.HoverProvider {
  constructor(private readonly translationService: TranslationService) {}

  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): Promise<vscode.Hover | undefined> {
    const range = document.getWordRangeAtPosition(position, /"[^"]+"/)
    if (!range) {
      return undefined
    }

    const key = document.getText(range).slice(1, -1)
    const missingLocales =
      await this.translationService.findMissingTranslations(key)

    if (missingLocales.length === 0) {
      return undefined
    }

    const message = new vscode.MarkdownString()
    message.appendMarkdown(`**Missing translations for key "${key}"**\n\n`)
    message.appendMarkdown(`Missing in locales: ${missingLocales.join(', ')}`)

    return new vscode.Hover(message, range)
  }
}
