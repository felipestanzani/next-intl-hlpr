import * as vscode from 'vscode'
import { Logger } from '../utils/logger'
import { DiagnosticService } from '../services/diagnosticService'
import { TranslationService } from '../services/translationService'

export class HoverProvider implements vscode.HoverProvider {
  constructor(
    private readonly logger: Logger,
    private readonly diagnosticService: DiagnosticService,
    private readonly translationService: TranslationService
  ) {}

  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.Hover | undefined {
    this.logger.log(
      `Providing hover info for ${document.fileName} at position ${position.line}:${position.character}`
    )
    if (!document.fileName.endsWith('.json')) {
      this.logger.log('Not a JSON file, skipping hover')
      return undefined
    }

    const cache = this.diagnosticService.getCache(document)
    if (!cache) {
      this.logger.log('No cache found for document, skipping hover')
      return undefined
    }

    const { translations, keyPositions } = cache
    const missingTranslations =
      this.translationService.findMissingTranslations(translations)

    const hoveredKeyPosition = keyPositions.find((kp) =>
      kp.range.contains(position)
    )
    if (!hoveredKeyPosition) {
      this.logger.log('No key found at hover position')
      return undefined
    }

    const key = hoveredKeyPosition.key
    const missingLangs = missingTranslations.get(key)
    if (missingLangs && missingLangs.length > 0) {
      const message = `**Missing Translations**\n\nKey: \`${key}\`\nMissing languages: \`${missingLangs.join(
        ', '
      )}\``
      this.logger.log(`Hover info provided for key: ${key}`)
      return new vscode.Hover(
        new vscode.MarkdownString(message),
        hoveredKeyPosition.range
      )
    }

    this.logger.log('No missing translations for hovered key')
    return undefined
  }
}
