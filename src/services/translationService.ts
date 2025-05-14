import * as fs from 'fs'
import * as path from 'path'
import { Translation, ITranslationService } from '../interfaces/translation'
import { Logger } from '../utils/logger'

export class TranslationService implements ITranslationService {
  constructor(private readonly logger: Logger) {}

  loadTranslations(
    translationsPath: string,
    isSingleFile: boolean,
    fileName?: string
  ): Map<string, Translation> {
    const translations = new Map<string, Translation>()
    const modeStr = isSingleFile ? 'single-file' : 'folder'
    const fileStr = fileName ? `, file: ${fileName}` : ''
    this.logger.log(
      `Loading translations from ${translationsPath}, mode: ${modeStr}${fileStr}`
    )

    try {
      if (isSingleFile) {
        const files = fs
          .readdirSync(translationsPath)
          .filter((file) => file.endsWith('.json'))
        for (const file of files) {
          const lang = path.basename(file, '.json')
          const filePath = path.join(translationsPath, file)
          const translation = this.loadSingleTranslation(filePath)
          translations.set(lang, translation)
        }
      } else {
        const langFolders = fs
          .readdirSync(translationsPath)
          .filter((folder) => {
            const folderPath = path.join(translationsPath, folder)
            return fs.lstatSync(folderPath).isDirectory()
          })
        for (const lang of langFolders) {
          const langPath = path.join(translationsPath, lang)
          if (fileName) {
            const translation = this.loadEquivalentTranslations(
              langPath,
              fileName
            )
            translations.set(lang, translation)
          }
        }
      }
    } catch (error) {
      this.logger.log(
        `Error loading translations from ${translationsPath}`,
        error
      )
    }

    this.logger.log(`Loaded translations for ${translations.size} languages`)
    return translations
  }

  findMissingTranslations(
    translations: Map<string, Translation>
  ): Map<string, string[]> {
    this.logger.log('Finding missing translations')
    const missing = new Map<string, string[]>()
    const allKeys = new Set<string>()
    const languages = Array.from(translations.keys())

    // Collect all unique keys
    for (const translation of translations.values()) {
      this.getAllKeys(translation).forEach((key) => allKeys.add(key))
    }

    // Check each key for missing languages
    for (const key of allKeys) {
      const missingLangs: string[] = []
      for (const lang of languages) {
        const translation = translations.get(lang)!
        if (!this.hasKey(translation, key)) {
          missingLangs.push(lang)
        }
      }
      if (missingLangs.length > 0) {
        missing.set(key, missingLangs)
      }
    }
    this.logger.log(`Found ${missing.size} keys with missing translations`)
    return missing
  }

  hasKey(obj: Translation, key: string): boolean {
    const parts = key.split('.')
    let current: Translation | string = obj
    for (const part of parts) {
      if (typeof current === 'string' || !(part in current)) {
        return false
      }
      current = current[part]
    }
    return typeof current === 'string' && current.trim() !== ''
  }

  getAllKeys(obj: Translation, prefix: string = ''): string[] {
    const keys: string[] = []
    for (const key in obj) {
      const fullKey = prefix ? `${prefix}.${key}` : key
      if (typeof obj[key] === 'string' && obj[key].trim() !== '') {
        keys.push(fullKey)
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        keys.push(...this.getAllKeys(obj[key], fullKey))
      }
    }
    return keys
  }

  private loadSingleTranslation(filePath: string): Translation {
    try {
      const content = fs.readFileSync(filePath, 'utf8')
      const result = JSON.parse(content)
      this.logger.log(`Loaded translation file: ${filePath}`)
      return result
    } catch (error) {
      this.logger.log(`Error parsing translation file ${filePath}`, error)
      return {}
    }
  }

  private loadEquivalentTranslations(
    langPath: string,
    fileName: string
  ): Translation {
    const filePath = path.join(langPath, fileName)
    try {
      if (fs.existsSync(filePath)) {
        return this.loadSingleTranslation(filePath)
      }
      this.logger.log(`No equivalent translation file found: ${filePath}`)
      return {}
    } catch (error) {
      this.logger.log(
        `Error checking equivalent translation file ${filePath}`,
        error
      )
      return {}
    }
  }
}
