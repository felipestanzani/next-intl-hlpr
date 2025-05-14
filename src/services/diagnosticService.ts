import * as vscode from 'vscode'
import * as path from 'path'
import { KeyPosition, TranslationCache } from '../interfaces/translation'
import { Logger } from '../utils/logger'
import { TranslationService } from './translationService'
import { ConfigService } from './configService'

export class DiagnosticService {
  private readonly documentCache = new Map<string, TranslationCache>()

  constructor(
    private readonly logger: Logger,
    private readonly translationService: TranslationService,
    private readonly configService: ConfigService,
    private readonly diagnosticCollection: vscode.DiagnosticCollection
  ) {}

  updateDiagnostics(document: vscode.TextDocument): void {
    this.logger.log(`Updating diagnostics for ${document.fileName}`)
    if (!document.fileName.endsWith('.json')) {
      this.logger.log('Document is not a JSON file, skipping')
      return
    }

    const translationsPath = this.configService.findTranslationsFolder()
    if (!translationsPath) {
      this.logger.log('No translations path, clearing diagnostics')
      this.diagnosticCollection.delete(document.uri)
      return
    }

    const isSingleFile = this.configService.isSingleFileMode(translationsPath)
    let lang: string
    let fileName: string | undefined

    // Determine the language and file name
    const translationsFolder = this.configService.getTranslationsFolder()
    const translationsFolderPath = path.join(
      vscode.workspace.workspaceFolders![0].uri.fsPath,
      translationsFolder
    )
    const relativePath = path.relative(
      translationsFolderPath,
      document.fileName
    )

    try {
      if (isSingleFile) {
        const fileDir = path.dirname(document.fileName)
        if (
          path.normalize(fileDir) !== path.normalize(translationsFolderPath)
        ) {
          this.logger.log('Document not in translations folder, skipping')
          return
        }
        lang = path.basename(document.fileName, '.json')
      } else {
        const pathParts = relativePath.split(path.sep)
        if (pathParts.length < 2) {
          this.logger.log('Document not in language subfolder, skipping')
          return
        }
        lang = pathParts[0]
        fileName = pathParts.slice(1).join(path.sep)
      }
      this.logger.log(
        `Processing document: lang=${lang}${
          fileName ? `, fileName=${fileName}` : ''
        }`
      )

      // Load translations
      const translations = this.translationService.loadTranslations(
        translationsPath,
        isSingleFile,
        fileName
      )
      const translation = translations.get(lang)
      if (!translation) {
        this.logger.log(`No translation found for language ${lang}, skipping`)
        return
      }

      // Find all keys and their positions in the document
      const keyPositions = this.findKeysInDocument(document)
      const missingTranslations =
        this.translationService.findMissingTranslations(translations)

      const diagnostics: vscode.Diagnostic[] = []
      for (const { key, range } of keyPositions) {
        const missingLangs = missingTranslations.get(key)
        if (missingLangs && !missingLangs.includes(lang)) {
          const diagnostic = new vscode.Diagnostic(
            range,
            `Translation key "${key}" is missing in: ${missingLangs.join(
              ', '
            )}`,
            vscode.DiagnosticSeverity.Warning
          )
          diagnostic.source = 'next-intl-hlpr'
          diagnostics.push(diagnostic)
        }
      }

      // Update cache and diagnostics
      this.documentCache.set(document.uri.fsPath, {
        translations,
        keyPositions
      })
      this.diagnosticCollection.set(document.uri, diagnostics)
      this.logger.log(
        `Set ${diagnostics.length} diagnostics for ${document.fileName}`
      )
    } catch (error) {
      this.logger.log(
        `Error updating diagnostics for ${document.fileName}`,
        error
      )
    }
  }

  private findKeysInDocument(document: vscode.TextDocument): KeyPosition[] {
    this.logger.log(`Parsing keys in document: ${document.fileName}`)
    const text = document.getText()
    const positions: KeyPosition[] = []

    try {
      const json = JSON.parse(text)
      const lines = text.split('\n')

      function traverse(
        obj: any,
        prefix: string = '',
        lineNum: number = 0,
        charOffset: number = 0
      ): number {
        let currentLine = lineNum
        let currentOffset = charOffset

        for (const key in obj) {
          const fullKey = prefix ? `${prefix}.${key}` : key
          const value = obj[key]

          // Find the key in the text
          const keyPattern = `"${key}"\\s*:\\s*`
          const keyRegex = new RegExp(keyPattern)
          let found = false
          let keyStart: vscode.Position | undefined
          let keyEnd: vscode.Position | undefined

          for (let i = currentLine; i < lines.length; i++) {
            const line = lines[i]
            const match = keyRegex.exec(line.slice(currentOffset))
            if (match) {
              const keyStartChar = line.indexOf(`"${key}"`) + 1
              keyStart = new vscode.Position(i, keyStartChar)
              keyEnd = new vscode.Position(i, keyStartChar + key.length)
              currentLine = i
              currentOffset = keyStartChar + match[0].length
              found = true
              break
            }
            currentOffset = 0
          }

          if (found && typeof value === 'string') {
            positions.push({
              key: fullKey,
              range: new vscode.Range(keyStart!, keyEnd!)
            })
          } else if (typeof value === 'object' && value !== null) {
            currentLine = traverse(value, fullKey, currentLine, currentOffset)
          }
        }
        return currentLine
      }

      traverse(json)
      this.logger.log(`Found ${positions.length} keys in document`)
      return positions
    } catch (error) {
      this.logger.log(
        `Error parsing keys in document ${document.fileName}`,
        error
      )
      return []
    }
  }

  getCache(document: vscode.TextDocument): TranslationCache | undefined {
    return this.documentCache.get(document.uri.fsPath)
  }

  clearCache(document: vscode.TextDocument): void {
    this.documentCache.delete(document.uri.fsPath)
  }
}
