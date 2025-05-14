import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import { Logger } from '../utils/logger'
import { ConfigService } from './configService'
import { Translation, ITranslationService } from '../interfaces/translation'
import { NextIntlConfig, MessageConfig } from '../interfaces/nextIntlConfig'

export class TranslationService implements ITranslationService {
  private translations: Map<string, Translation> = new Map()
  private fileWatcher: vscode.FileSystemWatcher | undefined

  constructor(
    private readonly logger: Logger,
    private readonly configService: ConfigService
  ) {}

  async initialize(): Promise<void> {
    const config = await this.configService.getNextIntlConfig()
    if (!config) {
      this.logger.log('No next-intl configuration found')
      return
    }

    const messageConfig = this.configService.getMessageConfig()
    if (!messageConfig) {
      this.logger.log('No message configuration found')
      return
    }

    await this.loadTranslations(config, messageConfig)
    this.setupFileWatcher(config.messagesPath)
  }

  private async loadTranslations(
    config: NextIntlConfig,
    messageConfig: MessageConfig
  ): Promise<void> {
    try {
      this.translations.clear()

      for (const locale of config.locales) {
        const translation: Translation = {
          locale,
          messages: new Map()
        }

        const filePath = this.resolveMessagePath(
          path.dirname(path.dirname(config.requestPath)),
          locale,
          messageConfig
        )
        this.logger.log(`Loading translations from: ${filePath}`)

        if (fs.existsSync(filePath)) {
          const content = await fs.promises.readFile(filePath, 'utf8')
          const messages = JSON.parse(content)
          this.addMessagesToTranslation(translation, messages)
        } else {
          this.logger.log(`Translation file not found: ${filePath}`)
        }

        this.translations.set(locale, translation)
      }

      this.logger.log(
        `Loaded translations for ${config.locales.length} locales`
      )
    } catch (error) {
      this.logger.log('Error loading translations', error)
    }
  }

  private resolveMessagePath(
    basePath: string,
    locale: string,
    messageConfig: MessageConfig
  ): string {
    const loadPath = messageConfig.loadPath.replace('${locale}', locale)
    return path.join(basePath, loadPath)
  }

  private addMessagesToTranslation(
    translation: Translation,
    messages: Record<string, any>,
    prefix = ''
  ): void {
    for (const [key, value] of Object.entries(messages)) {
      const fullKey = prefix ? `${prefix}.${key}` : key
      if (typeof value === 'object' && value !== null) {
        this.addMessagesToTranslation(translation, value, fullKey)
      } else {
        translation.messages.set(fullKey, String(value))
      }
    }
  }

  private setupFileWatcher(messagesPath: string): void {
    if (this.fileWatcher) {
      this.fileWatcher.dispose()
    }

    const projectRoot = path.dirname(path.dirname(messagesPath))
    const messagesDir = path.join(projectRoot, 'messages')
    this.logger.log(`Setting up file watcher for: ${messagesDir}`)

    this.fileWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(messagesDir, '**/*.json'),
      false,
      false,
      false
    )

    this.fileWatcher.onDidChange(async () => {
      const config = await this.configService.getNextIntlConfig()
      const messageConfig = this.configService.getMessageConfig()
      if (config && messageConfig) {
        await this.loadTranslations(config, messageConfig)
      }
    })
  }

  getTranslation(locale: string): Translation | undefined {
    return this.translations.get(locale)
  }

  getAllTranslations(): Translation[] {
    return Array.from(this.translations.values())
  }

  async findMissingTranslations(key: string): Promise<string[]> {
    const missingLocales: string[] = []
    const config = await this.configService.getNextIntlConfig()
    const messageConfig = this.configService.getMessageConfig()

    if (!config || !messageConfig) {
      return missingLocales
    }

    // Get the current file's locale from the key
    const currentLocale = this.getCurrentLocale(key)
    if (!currentLocale) {
      return missingLocales
    }

    this.logger.log(
      `Checking translations for key "${key}" in locale "${currentLocale}"`
    )

    // First, check if this key exists in all other locales
    for (const locale of config.locales) {
      if (locale === currentLocale) {
        continue
      }

      const translation = this.translations.get(locale)
      if (!translation || !translation.messages.has(key)) {
        this.logger.log(`Key "${key}" is missing in locale "${locale}"`)
        missingLocales.push(locale)
      }
    }

    // Then, check if any keys from other locales are missing in the current locale
    const currentTranslation = this.translations.get(currentLocale)
    if (currentTranslation) {
      for (const locale of config.locales) {
        if (locale === currentLocale) {
          continue
        }

        const otherTranslation = this.translations.get(locale)
        if (otherTranslation) {
          // Get all keys from the other locale
          const otherKeys = Array.from(otherTranslation.messages.keys())

          // Check each key from the other locale
          for (const otherKey of otherKeys) {
            if (!currentTranslation.messages.has(otherKey)) {
              this.logger.log(
                `Key "${otherKey}" from locale "${locale}" is missing in "${currentLocale}"`
              )
              if (!missingLocales.includes(locale)) {
                missingLocales.push(locale)
              }
            }
          }
        }
      }
    }

    this.logger.log(
      `Found missing translations in locales: ${missingLocales.join(', ')}`
    )
    return missingLocales
  }

  private getCurrentLocale(key: string): string | undefined {
    // Try to find the locale by checking which translation file contains this key
    for (const [locale, translation] of this.translations.entries()) {
      if (translation.messages.has(key)) {
        this.logger.log(`Found key "${key}" in locale "${locale}"`)
        return locale
      }
    }
    this.logger.log(`Key "${key}" not found in any locale`)
    return undefined
  }

  async reloadTranslations(): Promise<void> {
    this.logger.log('Reloading translations')
    this.translations.clear()
    const config = await this.configService.getNextIntlConfig()
    if (!config) {
      return
    }

    const messageConfig = this.configService.getMessageConfig()
    if (!messageConfig) {
      return
    }

    await this.loadTranslations(config, messageConfig)
  }

  dispose(): void {
    if (this.fileWatcher) {
      this.fileWatcher.dispose()
    }
  }
}
