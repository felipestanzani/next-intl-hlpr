import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import { Logger } from '../utils/logger'
import {
  NextIntlConfig,
  MessageConfig,
  ConfigPaths
} from '../interfaces/nextIntlConfig'

export class ConfigService {
  private configCache: NextIntlConfig | undefined
  private messageConfigCache: MessageConfig | undefined
  private readonly configExtensions = ['.js', '.ts', '.mjs', '.cjs']

  constructor(private readonly logger: Logger) {}

  async getNextIntlConfig(): Promise<NextIntlConfig | undefined> {
    if (this.configCache) {
      return this.configCache
    }

    const configPaths = await this.findConfigPaths()
    if (!configPaths) {
      this.logger.log('No next-intl configuration found')
      return undefined
    }

    try {
      this.logger.log(`Found next.config at: ${configPaths.nextConfigPath}`)
      this.logger.log(`Looking for request.ts at: ${configPaths.requestPath}`)

      const nextConfig = await this.parseNextConfig(configPaths.nextConfigPath)
      if (!nextConfig) {
        this.logger.log('Failed to parse next.config')
        return undefined
      }

      const messageConfig = await this.parseRequestConfig(
        configPaths.requestPath
      )
      if (!messageConfig) {
        this.logger.log('Failed to parse request.ts')
        return undefined
      }

      // Detect available locales from the messages directory
      const messagesDir = path.join(
        path.dirname(configPaths.nextConfigPath),
        messageConfig.loadPath.split('/').slice(0, -1).join('/')
      )
      this.logger.log(`Looking for locale files in: ${messagesDir}`)

      const locales = await this.detectLocales(messagesDir)
      if (locales.length === 0) {
        this.logger.log('No locale files found in messages directory')
        return undefined
      }

      this.logger.log(`Detected locales: ${locales.join(', ')}`)

      this.configCache = {
        locales,
        defaultLocale: nextConfig.defaultLocale,
        messagesPath: messageConfig.loadPath,
        requestPath: configPaths.requestPath
      }

      this.messageConfigCache = messageConfig
      return this.configCache
    } catch (error) {
      this.logger.log('Error parsing next-intl configuration', error)
      return undefined
    }
  }

  private async detectLocales(messagesDir: string): Promise<string[]> {
    try {
      if (!fs.existsSync(messagesDir)) {
        this.logger.log(`Messages directory not found: ${messagesDir}`)
        return []
      }

      const files = fs.readdirSync(messagesDir)
      const locales = files
        .filter((file) => file.endsWith('.json'))
        .map((file) => file.replace('.json', ''))
        .filter(Boolean)

      this.logger.log(`Found locale files: ${locales.join(', ')}`)
      return locales
    } catch (error) {
      this.logger.log('Error detecting locales', error)
      return []
    }
  }

  getMessageConfig(): MessageConfig | undefined {
    return this.messageConfigCache
  }

  private async findConfigPaths(): Promise<ConfigPaths | undefined> {
    const workspaceFolders = vscode.workspace.workspaceFolders
    if (!workspaceFolders) {
      this.logger.log('No workspace folders found')
      return undefined
    }

    const config = vscode.workspace.getConfiguration('nextIntlHlpr')
    const detectConfig = config.get('detectConfig', true)
    const customConfigPath = config.get('configPath', '')
    const customRequestPath = config.get('requestPath', '')

    this.logger.log(
      `Configuration: detectConfig=${detectConfig}, customConfigPath=${customConfigPath}, customRequestPath=${customRequestPath}`
    )

    if (!detectConfig && !customConfigPath) {
      this.logger.log(
        'Auto-detection disabled and no custom config path provided'
      )
      return undefined
    }

    for (const folder of workspaceFolders) {
      const rootPath = folder.uri.fsPath
      this.logger.log(`Checking workspace folder: ${rootPath}`)

      // Try to find next.config with any supported extension
      let nextConfigPath: string | undefined
      if (customConfigPath) {
        for (const ext of this.configExtensions) {
          const configPath = path.join(
            rootPath,
            customConfigPath,
            `next.config${ext}`
          )
          if (fs.existsSync(configPath)) {
            nextConfigPath = configPath
            break
          }
        }
      } else {
        for (const ext of this.configExtensions) {
          const configPath = path.join(rootPath, `next.config${ext}`)
          if (fs.existsSync(configPath)) {
            nextConfigPath = configPath
            break
          }
        }
      }

      const requestPath = customRequestPath
        ? path.join(rootPath, customRequestPath)
        : path.join(rootPath, 'i18n', 'request.ts')

      this.logger.log(
        `Looking for next.config at: ${nextConfigPath || 'not found'}`
      )
      this.logger.log(`Looking for request.ts at: ${requestPath}`)

      if (nextConfigPath) {
        this.logger.log(`Found next.config at: ${nextConfigPath}`)
        return {
          nextConfigPath,
          requestPath,
          messagesPath: path.join(rootPath, 'messages')
        }
      } else {
        this.logger.log('No next.config found in workspace')
      }
    }

    this.logger.log('No next-intl configuration found in workspace')
    return undefined
  }

  private async parseNextConfig(
    configPath: string
  ): Promise<{ locales: string[]; defaultLocale: string } | undefined> {
    try {
      const content = fs.readFileSync(configPath, 'utf8')
      this.logger.log(
        `Reading next.config content: ${content.substring(0, 200)}...`
      )

      // Check if createNextIntlPlugin is used
      const createNextIntlPluginMatch = content.match(
        /createNextIntlPlugin\(([\s\S]*?)\)/
      )

      if (!createNextIntlPluginMatch) {
        this.logger.log('No createNextIntlPlugin found in next.config')
        return undefined
      }

      const configContent = createNextIntlPluginMatch[1]
      this.logger.log(`Found createNextIntlPlugin config: ${configContent}`)

      // If createNextIntlPlugin is called without parameters, try to find locales in the request.ts file
      if (!configContent.trim()) {
        this.logger.log(
          'createNextIntlPlugin called without parameters, checking request.ts'
        )
        const requestPath = path.join(
          path.dirname(configPath),
          'i18n',
          'request.ts'
        )
        if (fs.existsSync(requestPath)) {
          const requestContent = fs.readFileSync(requestPath, 'utf8')
          const localeMatch = requestContent.match(
            /locale\s*=\s*['"]([^'"]+)['"]/
          )
          if (localeMatch) {
            return {
              locales: [localeMatch[1]],
              defaultLocale: localeMatch[1]
            }
          }
        }
        return undefined
      }

      const localesMatch = configContent.match(/locales:\s*\[([\s\S]*?)\]/)
      const defaultLocaleMatch = configContent.match(
        /defaultLocale:\s*['"]([^'"]+)['"]/
      )

      if (!localesMatch || !defaultLocaleMatch) {
        this.logger.log(
          'Missing required configuration in createNextIntlPlugin'
        )
        return undefined
      }

      const locales = localesMatch[1]
        .split(',')
        .map((locale) => locale.trim().replace(/['"]/g, ''))
        .filter(Boolean)

      return {
        locales,
        defaultLocale: defaultLocaleMatch[1]
      }
    } catch (error) {
      this.logger.log('Error parsing next.config', error)
      return undefined
    }
  }

  private async parseRequestConfig(
    requestPath: string
  ): Promise<MessageConfig | undefined> {
    try {
      if (!fs.existsSync(requestPath)) {
        this.logger.log(`Request config file not found: ${requestPath}`)
        return undefined
      }

      const content = fs.readFileSync(requestPath, 'utf8')
      this.logger.log(
        `Reading request.ts content: ${content.substring(0, 200)}...`
      )

      // Try both getMessages and getRequestConfig formats
      const getMessagesMatch = content.match(
        /getMessages\([\s\S]*?{([\s\S]*?)}/
      )
      const getRequestConfigMatch = content.match(
        /getRequestConfig\([\s\S]*?{([\s\S]*?)}/
      )

      if (!getMessagesMatch && !getRequestConfigMatch) {
        this.logger.log(
          'No getMessages or getRequestConfig function found in request.ts'
        )
        return undefined
      }

      // For getRequestConfig format
      if (getRequestConfigMatch) {
        this.logger.log('Found getRequestConfig format')
        // Look for the dynamic import pattern in the return statement
        const messagesImportMatch = content.match(
          /messages:\s*\(\s*await\s*import\(`([^`]+)`\)\)/
        )
        if (messagesImportMatch) {
          const messagesPath = messagesImportMatch[1].replace(
            /\.\.\/\.\.\//,
            ''
          )
          this.logger.log(`Found messages path: ${messagesPath}`)
          return {
            namespaces: ['default'],
            defaultNamespace: 'default',
            loadPath: messagesPath,
            dynamicImport: true
          }
        }
        this.logger.log('No messages import found in getRequestConfig')
        return undefined
      }

      // For getMessages format
      const configContent = getMessagesMatch?.[1]
      this.logger.log(`Found getMessages config: ${configContent}`)

      const namespacesMatch = configContent?.match(
        /namespaces:\s*\[([\s\S]*?)\]/
      )
      const defaultNamespaceMatch = configContent?.match(
        /defaultNamespace:\s*['"]([^'"]+)['"]/
      )
      const loadPathMatch = configContent?.match(/loadPath:\s*['"]([^'"]+)['"]/)
      const dynamicImportMatch = content.match(/dynamicImport:\s*(true|false)/)

      if (!namespacesMatch || !defaultNamespaceMatch || !loadPathMatch) {
        this.logger.log('Missing required configuration in getMessages')
        return undefined
      }

      const namespaces = namespacesMatch[1]
        .split(',')
        .map((ns) => ns.trim().replace(/['"]/g, ''))
        .filter(Boolean)

      return {
        namespaces,
        defaultNamespace: defaultNamespaceMatch[1],
        loadPath: loadPathMatch[1],
        dynamicImport: dynamicImportMatch
          ? dynamicImportMatch[1] === 'true'
          : false
      }
    } catch (error) {
      this.logger.log('Error parsing request.ts', error)
      return undefined
    }
  }

  clearCache(): void {
    this.configCache = undefined
    this.messageConfigCache = undefined
  }

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
