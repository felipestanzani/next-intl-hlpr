import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import { Logger } from '../utils/logger'

export class ConfigService {
  constructor(private readonly logger: Logger) {}

  getTranslationsFolder(): string {
    const config = vscode.workspace.getConfiguration('nextIntlHlpr')
    const folder = config.get('translationsFolder', 'messages')
    this.logger.log(`Translations folder configured: ${folder}`)
    return folder
  }

  getTranslationsMode(): string {
    const config = vscode.workspace.getConfiguration('nextIntlHlpr')
    const mode = config.get('translationsMode', 'auto')
    this.logger.log(`Translations mode configured: ${mode}`)
    return mode
  }

  findTranslationsFolder(): string | undefined {
    const workspaceFolders = vscode.workspace.workspaceFolders
    if (!workspaceFolders) {
      this.logger.log(
        'No workspace folders found',
        new Error('Workspace not open')
      )
      return undefined
    }

    const translationsFolder = this.getTranslationsFolder()
    for (const folder of workspaceFolders) {
      const translationsPath = path.join(folder.uri.fsPath, translationsFolder)
      try {
        if (
          fs.existsSync(translationsPath) &&
          fs.lstatSync(translationsPath).isDirectory()
        ) {
          this.logger.log(`Translations folder found: ${translationsPath}`)
          return translationsPath
        }
      } catch (error) {
        this.logger.log(
          `Error checking translations folder ${translationsPath}`,
          error
        )
      }
    }
    this.logger.log('No translations folder found in workspace')
    return undefined
  }

  isSingleFileMode(translationsPath: string): boolean {
    const mode = this.getTranslationsMode()
    if (mode === 'single-file') {
      this.logger.log('Single-file mode enforced')
      return true
    } else if (mode === 'folder') {
      this.logger.log('Folder mode enforced')
      return false
    }

    try {
      const contents = fs.readdirSync(translationsPath)
      const hasSubfolders = contents.some((item) => {
        const itemPath = path.join(translationsPath, item)
        return fs.lstatSync(itemPath).isDirectory()
      })
      if (hasSubfolders) {
        this.logger.log('Auto mode: detected subfolders, using folder mode')
        return false // Prioritize folder mode
      }
      const hasJson = contents.some((item) => item.endsWith('.json'))
      this.logger.log(
        `Auto mode: ${
          hasJson
            ? 'detected JSON files, using single-file mode'
            : 'no JSON files, defaulting to single-file mode'
        }`
      )
      return hasJson
    } catch (error) {
      this.logger.log(
        `Error reading translations folder ${translationsPath}`,
        error
      )
      return true // Fallback to single-file mode
    }
  }
}
