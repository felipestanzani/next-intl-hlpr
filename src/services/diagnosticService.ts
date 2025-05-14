import * as vscode from 'vscode'
import * as path from 'path'
import { Logger } from '../utils/logger'
import { TranslationService } from './translationService'
import { ConfigService } from './configService'

export class DiagnosticService {
  private diagnosticCollection: vscode.DiagnosticCollection
  private fileWatcher: vscode.FileSystemWatcher | undefined

  constructor(
    private readonly logger: Logger,
    private readonly translationService: TranslationService,
    private readonly configService: ConfigService
  ) {
    this.diagnosticCollection =
      vscode.languages.createDiagnosticCollection('next-intl-hlpr')
    this.setupFileWatcher()
  }

  private async setupFileWatcher(): Promise<void> {
    // Dispose existing watcher if any
    if (this.fileWatcher) {
      this.fileWatcher.dispose()
    }

    // Create new watcher for all JSON files in the messages directory
    const config = await this.configService.getNextIntlConfig()
    if (!config) {
      return
    }

    const messagesDir = path.dirname(config.requestPath)
    const pattern = new vscode.RelativePattern(
      vscode.workspace.getWorkspaceFolder(vscode.Uri.file(messagesDir))!,
      'messages/*.json'
    )

    this.fileWatcher = vscode.workspace.createFileSystemWatcher(pattern)

    this.fileWatcher.onDidChange(async (uri) => {
      this.logger.log(`Translation file changed: ${uri.fsPath}`)
      await this.translationService.reloadTranslations()
      await this.updateDiagnostics(await vscode.workspace.openTextDocument(uri))
    })

    this.fileWatcher.onDidCreate(async (uri) => {
      this.logger.log(`New translation file created: ${uri.fsPath}`)
      await this.translationService.reloadTranslations()
      await this.updateDiagnostics(await vscode.workspace.openTextDocument(uri))
    })

    this.fileWatcher.onDidDelete(async (uri) => {
      this.logger.log(`Translation file deleted: ${uri.fsPath}`)
      await this.translationService.reloadTranslations()
      this.clearDiagnostics(uri)
    })
  }

  async updateDiagnostics(document: vscode.TextDocument): Promise<void> {
    if (document.languageId !== 'json') {
      return
    }

    this.logger.log(`Updating diagnostics for: ${document.uri.fsPath}`)

    try {
      const config = await this.configService.getNextIntlConfig()
      if (!config) {
        return
      }

      // Update diagnostics for all translation files
      for (const locale of config.locales) {
        const filePath = path.join(
          path.dirname(document.uri.fsPath),
          `${locale}.json`
        )
        const uri = vscode.Uri.file(filePath)

        try {
          const doc = await vscode.workspace.openTextDocument(uri)
          await this.updateFileDiagnostics(doc)
        } catch (error) {
          // File might not exist yet, that's okay
          this.logger.log(`Could not open file ${filePath}: ${error}`)
        }
      }
    } catch (error) {
      this.logger.log('Error updating diagnostics', error)
    }
  }

  private async updateFileDiagnostics(
    document: vscode.TextDocument
  ): Promise<void> {
    const diagnostics: vscode.Diagnostic[] = []
    const currentLocale = this.getCurrentLocale(document.uri.fsPath)

    if (!currentLocale) {
      return
    }

    // Get all translations
    const allTranslations = this.translationService.getAllTranslations()
    const currentTranslation = allTranslations.find(
      (t) => t.locale === currentLocale
    )

    if (!currentTranslation) {
      return
    }

    // Check each translation file
    for (const translation of allTranslations) {
      if (translation.locale === currentLocale) {
        continue
      }

      // Check for keys that exist in other locales but not in current
      for (const [key] of translation.messages) {
        if (!currentTranslation.messages.has(key)) {
          const range = this.findKeyRange(document, key)
          if (range) {
            const diagnostic = this.createMissingTranslationDiagnostic(
              range,
              key,
              [translation.locale]
            )
            diagnostics.push(diagnostic)
          }
        }
      }

      // Check for keys that exist in current but not in other locales
      for (const [key] of currentTranslation.messages) {
        if (!translation.messages.has(key)) {
          const range = this.findKeyRange(document, key)
          if (range) {
            const diagnostic = this.createMissingTranslationDiagnostic(
              range,
              key,
              [translation.locale]
            )
            diagnostics.push(diagnostic)
          }
        }
      }
    }

    this.logger.log(
      `Found ${diagnostics.length} missing translations in ${currentLocale}`
    )
    this.diagnosticCollection.set(document.uri, diagnostics)
  }

  private getCurrentLocale(filePath: string): string | undefined {
    const fileName = path.basename(filePath)
    const match = fileName.match(/([a-z]{2})\.json$/)
    return match ? match[1] : undefined
  }

  private findKeyRange(
    document: vscode.TextDocument,
    key: string
  ): vscode.Range | undefined {
    const text = document.getText()
    const keyParts = key.split('.')
    const lastKey = keyParts[keyParts.length - 1]

    // Create a pattern that matches the last part of the key
    const keyPattern = new RegExp(`"${lastKey}"\\s*:`, 'g')
    let match: RegExpExecArray | null

    while ((match = keyPattern.exec(text)) !== null) {
      const startPos = document.positionAt(match.index)
      const endPos = document.positionAt(match.index + match[0].length)
      return new vscode.Range(startPos, endPos)
    }

    return undefined
  }

  private createMissingTranslationDiagnostic(
    range: vscode.Range,
    key: string,
    missingLocales: string[]
  ): vscode.Diagnostic {
    const message = `Missing translations for key "${key}" in locales: ${missingLocales.join(
      ', '
    )}`
    const diagnostic = new vscode.Diagnostic(
      range,
      message,
      vscode.DiagnosticSeverity.Warning
    )
    diagnostic.source = 'next-intl-hlpr'
    return diagnostic
  }

  clearDiagnostics(uri: vscode.Uri): void {
    this.diagnosticCollection.delete(uri)
  }

  dispose(): void {
    if (this.fileWatcher) {
      this.fileWatcher.dispose()
    }
    this.diagnosticCollection.dispose()
  }
}
