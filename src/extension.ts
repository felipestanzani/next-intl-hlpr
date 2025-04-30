import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'

// Interface for translation JSON structure
interface Translation {
  [key: string]: string | Translation
}

// Cache for translation data and key positions
const documentCache = new Map<
  string,
  { translations: Map<string, Translation>; keyPositions: KeyPosition[] }
>()

// Create output channel for logging
const outputChannel = vscode.window.createOutputChannel('next-intl-hlpr')

// Log helper function
function log(message: string, error?: any) {
  const timestamp = new Date().toISOString()
  outputChannel.appendLine(`[${timestamp}] ${message}`)
  if (error) {
    outputChannel.appendLine(`[${timestamp}] Error: ${error.message || error}`)
    console.error(error)
  }
}

// Activate the extension
export function activate(context: vscode.ExtensionContext) {
  log('Activating next-intl-hlpr extension')

  // Create a diagnostic collection for missing translations
  const diagnosticCollection =
    vscode.languages.createDiagnosticCollection('next-intl-hlpr')
  context.subscriptions.push(diagnosticCollection)
  log('Diagnostic collection created')

  // Register hover provider for JSON files
  const hoverProvider = vscode.languages.registerHoverProvider(
    { scheme: 'file', language: 'json', pattern: '**/*.json' },
    {
      provideHover(document, position) {
        log(`Providing hover for ${document.uri.fsPath}`)
        return provideHoverInfo(document, position)
      }
    }
  )
  context.subscriptions.push(hoverProvider)
  log('Hover provider registered')

  // Set up file system watcher for translation folder
  const translationsFolder = getTranslationsFolder()
  if (!vscode.workspace.workspaceFolders) {
    log('No workspace folders found', new Error('Workspace not open'))
    return
  }
  const watcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(
      vscode.workspace.workspaceFolders[0],
      `${translationsFolder}/**/*.json`
    )
  )
  context.subscriptions.push(watcher)
  log(`File system watcher created for ${translationsFolder}/**/*.json`)

  // Update diagnostics on file system changes
  const updateAllJsonDiagnostics = () => {
    log('File system event triggered, updating diagnostics')
    documentCache.clear() // Invalidate cache
    vscode.workspace.textDocuments.forEach((document) => {
      if (
        document.languageId === 'json' &&
        document.fileName.endsWith('.json')
      ) {
        updateDiagnostics(document, diagnosticCollection)
      }
    })
  }

  watcher.onDidCreate((uri) => {
    log(`File created: ${uri.fsPath}`)
    updateAllJsonDiagnostics()
  })
  watcher.onDidChange((uri) => {
    log(`File changed: ${uri.fsPath}`)
    updateAllJsonDiagnostics()
  })
  watcher.onDidDelete((uri) => {
    log(`File deleted: ${uri.fsPath}`)
    updateAllJsonDiagnostics()
  })

  // Update diagnostics when a JSON file is opened, saved, or configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((document) => {
      if (
        document.languageId === 'json' &&
        document.fileName.endsWith('.json')
      ) {
        log(`Document opened: ${document.fileName}`)
        updateDiagnostics(document, diagnosticCollection)
      }
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (
        event.document.languageId === 'json' &&
        event.document.fileName.endsWith('.json')
      ) {
        log(`Document changed: ${event.document.fileName}`)
        updateDiagnostics(event.document, diagnosticCollection)
      }
    }),
    vscode.workspace.onDidCloseTextDocument((document) => {
      if (
        document.languageId === 'json' &&
        document.fileName.endsWith('.json')
      ) {
        log(`Document closed: ${document.fileName}`)
        diagnosticCollection.delete(document.uri)
        documentCache.delete(document.uri.fsPath)
      }
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        event.affectsConfiguration('nextIntlHlpr.translationsFolder') ||
        event.affectsConfiguration('nextIntlHlpr.translationsMode')
      ) {
        log('Configuration changed, updating diagnostics')
        documentCache.clear()
        vscode.workspace.textDocuments.forEach((document) => {
          if (
            document.languageId === 'json' &&
            document.fileName.endsWith('.json')
          ) {
            updateDiagnostics(document, diagnosticCollection)
          }
        })
      }
    })
  )

  // Initial scan of open JSON files
  vscode.workspace.textDocuments.forEach((document) => {
    if (document.languageId === 'json' && document.fileName.endsWith('.json')) {
      log(`Initial scan for document: ${document.fileName}`)
      updateDiagnostics(document, diagnosticCollection)
    }
  })

  log('Extension activation completed')
}

// Deactivate the extension
export function deactivate() {
  log('Deactivating next-intl-hlpr extension')
}

// Get the configured translations folder
function getTranslationsFolder(): string {
  const config = vscode.workspace.getConfiguration('nextIntlHlpr')
  const folder = config.get('translationsFolder', 'messages')
  log(`Translations folder configured: ${folder}`)
  return folder
}

// Get the configured translations mode
function getTranslationsMode(): string {
  const config = vscode.workspace.getConfiguration('nextIntlHlpr')
  const mode = config.get('translationsMode', 'auto')
  log(`Translations mode configured: ${mode}`)
  return mode
}

// Find the translations folder in the workspace
function findTranslationsFolder(): string | undefined {
  const workspaceFolders = vscode.workspace.workspaceFolders
  if (!workspaceFolders) {
    log('No workspace folders found', new Error('Workspace not open'))
    return undefined
  }

  const translationsFolder = getTranslationsFolder()
  for (const folder of workspaceFolders) {
    const translationsPath = path.join(folder.uri.fsPath, translationsFolder)
    try {
      if (
        fs.existsSync(translationsPath) &&
        fs.lstatSync(translationsPath).isDirectory()
      ) {
        log(`Translations folder found: ${translationsPath}`)
        return translationsPath
      }
    } catch (error) {
      log(`Error checking translations folder ${translationsPath}`, error)
    }
  }
  log('No translations folder found in workspace')
  return undefined
}

// Determine if the translations folder uses single files
function isSingleFileMode(translationsPath: string): boolean {
  const mode = getTranslationsMode()
  if (mode === 'single-file') {
    log('Single-file mode enforced')
    return true
  } else if (mode === 'folder') {
    log('Folder mode enforced')
    return false
  }
  try {
    const contents = fs.readdirSync(translationsPath)
    const hasSubfolders = contents.some((item) => {
      const itemPath = path.join(translationsPath, item)
      return fs.lstatSync(itemPath).isDirectory()
    })
    if (hasSubfolders) {
      log('Auto mode: detected subfolders, using folder mode')
      return false // Prioritize folder mode
    }
    const hasJson = contents.some((item) => item.endsWith('.json'))
    log(
      `Auto mode: ${
        hasJson
          ? 'detected JSON files, using single-file mode'
          : 'no JSON files, defaulting to single-file mode'
      }`
    )
    return hasJson
  } catch (error) {
    log(`Error reading translations folder ${translationsPath}`, error)
    return true // Fallback to single-file mode
  }
}

// Load a single translation file
function loadSingleTranslation(filePath: string): Translation {
  try {
    const content = fs.readFileSync(filePath, 'utf8')
    const result = JSON.parse(content) // Use JSON.parse instead of jsonc-parser
    log(`Loaded translation file: ${filePath}`)
    return result
  } catch (error) {
    log(`Error parsing translation file ${filePath}`, error)
    vscode.window.showErrorMessage(
      `Error parsing ${filePath}: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
    return {}
  }
}

// Load all translation files for a language in folder mode (equivalent files only)
function loadEquivalentTranslations(
  langPath: string,
  fileName: string
): Translation {
  const filePath = path.join(langPath, fileName)
  try {
    if (fs.existsSync(filePath)) {
      return loadSingleTranslation(filePath)
    }
    log(`No equivalent translation file found: ${filePath}`)
    return {}
  } catch (error) {
    log(`Error checking equivalent translation file ${filePath}`, error)
    return {}
  }
}

// Load all translations
function loadTranslations(
  translationsPath: string,
  isSingleFile: boolean,
  fileName?: string
): Map<string, Translation> {
  const translations = new Map<string, Translation>()
  log(
    `Loading translations from ${translationsPath}, mode: ${
      isSingleFile ? 'single-file' : 'folder'
    }${fileName ? `, file: ${fileName}` : ''}`
  )

  try {
    if (isSingleFile) {
      const files = fs
        .readdirSync(translationsPath)
        .filter((file) => file.endsWith('.json'))
      for (const file of files) {
        const lang = path.basename(file, '.json')
        const filePath = path.join(translationsPath, file)
        const translation = loadSingleTranslation(filePath)
        translations.set(lang, translation)
      }
    } else {
      const langFolders = fs.readdirSync(translationsPath).filter((folder) => {
        const folderPath = path.join(translationsPath, folder)
        return fs.lstatSync(folderPath).isDirectory()
      })
      for (const lang of langFolders) {
        const langPath = path.join(translationsPath, lang)
        if (fileName) {
          const translation = loadEquivalentTranslations(langPath, fileName)
          translations.set(lang, translation)
        }
      }
    }
  } catch (error) {
    log(`Error loading translations from ${translationsPath}`, error)
  }

  log(`Loaded translations for ${translations.size} languages`)
  return translations
}

// Flatten nested object keys (handles nested properties)
function getAllKeys(obj: Translation, prefix: string = ''): string[] {
  const keys: string[] = []
  for (const key in obj) {
    const fullKey = prefix ? `${prefix}.${key}` : key
    if (typeof obj[key] === 'string' && obj[key].trim() !== '') {
      keys.push(fullKey)
    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
      keys.push(...getAllKeys(obj[key], fullKey))
    }
  }
  return keys
}

// Find missing translations
function findMissingTranslations(
  translations: Map<string, Translation>
): Map<string, string[]> {
  log('Finding missing translations')
  const missing = new Map<string, string[]>()
  const allKeys = new Set<string>()
  const languages = Array.from(translations.keys())

  // Collect all unique keys
  for (const translation of translations.values()) {
    getAllKeys(translation).forEach((key) => allKeys.add(key))
  }

  // Check each key for missing languages
  for (const key of allKeys) {
    const missingLangs: string[] = []
    for (const lang of languages) {
      const translation = translations.get(lang)!
      if (!hasKey(translation, key)) {
        missingLangs.push(lang)
      }
    }
    if (missingLangs.length > 0) {
      missing.set(key, missingLangs)
    }
  }
  log(`Found ${missing.size} keys with missing translations`)
  return missing
}

// Check if a key exists in a translation object (handles nested properties)
function hasKey(obj: Translation, key: string): boolean {
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

// Interface for key position in JSON
interface KeyPosition {
  key: string
  range: vscode.Range
}

// Find all keys and their positions in the JSON document
function findKeysInDocument(document: vscode.TextDocument): KeyPosition[] {
  log(`Parsing keys in document: ${document.fileName}`)
  const text = document.getText()
  const positions: KeyPosition[] = []

  try {
    const json = JSON.parse(text) // Parse JSON to validate and traverse
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
          const match = line.slice(currentOffset).match(keyRegex)
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
    log(`Found ${positions.length} keys in document`)
    return positions
  } catch (error) {
    log(`Error parsing keys in document ${document.fileName}`, error)
    return []
  }
}

// Update diagnostics for a document
function updateDiagnostics(
  document: vscode.TextDocument,
  collection: vscode.DiagnosticCollection
) {
  log(`Updating diagnostics for ${document.fileName}`)
  if (!document.fileName.endsWith('.json')) {
    log('Document is not a JSON file, skipping')
    return
  }

  const translationsPath = findTranslationsFolder()
  if (!translationsPath) {
    log('No translations path, clearing diagnostics')
    collection.delete(document.uri)
    return
  }

  const isSingleFile = isSingleFileMode(translationsPath)
  let lang: string
  let fileName: string | undefined

  // Determine the language and file name
  const translationsFolder = getTranslationsFolder()
  const translationsFolderPath = path.join(
    vscode.workspace.workspaceFolders![0].uri.fsPath,
    translationsFolder
  )
  const relativePath = path.relative(translationsFolderPath, document.fileName)

  try {
    if (isSingleFile) {
      const fileDir = path.dirname(document.fileName)
      if (path.normalize(fileDir) !== path.normalize(translationsFolderPath)) {
        log('Document not in translations folder, skipping')
        return
      }
      lang = path.basename(document.fileName, '.json')
    } else {
      const pathParts = relativePath.split(path.sep)
      if (pathParts.length < 2) {
        log('Document not in language subfolder, skipping')
        return
      }
      lang = pathParts[0]
      fileName = pathParts.slice(1).join(path.sep)
    }
    log(
      `Processing document: lang=${lang}${
        fileName ? `, fileName=${fileName}` : ''
      }`
    )

    // Load translations
    const translations = loadTranslations(
      translationsPath,
      isSingleFile,
      fileName
    )
    const translation = translations.get(lang)
    if (!translation) {
      log(`No translation found for language ${lang}, skipping`)
      return
    }

    // Find all keys and their positions in the document
    const keyPositions = findKeysInDocument(document)
    const missingTranslations = findMissingTranslations(translations)

    const diagnostics: vscode.Diagnostic[] = []
    for (const { key, range } of keyPositions) {
      const missingLangs = missingTranslations.get(key)
      if (missingLangs && !missingLangs.includes(lang)) {
        const diagnostic = new vscode.Diagnostic(
          range,
          `Translation key "${key}" is missing in: ${missingLangs.join(', ')}`,
          vscode.DiagnosticSeverity.Warning
        )
        diagnostic.source = 'next-intl-hlpr'
        diagnostics.push(diagnostic)
      }
    }

    // Update cache and diagnostics
    documentCache.set(document.uri.fsPath, { translations, keyPositions })
    collection.set(document.uri, diagnostics)
    log(`Set ${diagnostics.length} diagnostics for ${document.fileName}`)
  } catch (error) {
    log(`Error updating diagnostics for ${document.fileName}`, error)
  }
}

// Provide hover information
function provideHoverInfo(
  document: vscode.TextDocument,
  position: vscode.Position
): vscode.Hover | undefined {
  log(
    `Providing hover info for ${document.fileName} at position ${position.line}:${position.character}`
  )
  if (!document.fileName.endsWith('.json')) {
    log('Not a JSON file, skipping hover')
    return undefined
  }

  const cache = documentCache.get(document.uri.fsPath)
  if (!cache) {
    log('No cache found for document, skipping hover')
    return undefined
  }

  const { translations, keyPositions } = cache
  const missingTranslations = findMissingTranslations(translations)

  const hoveredKeyPosition = keyPositions.find((kp) =>
    kp.range.contains(position)
  )
  if (!hoveredKeyPosition) {
    log('No key found at hover position')
    return undefined
  }

  const key = hoveredKeyPosition.key
  const missingLangs = missingTranslations.get(key)
  if (missingLangs && missingLangs.length > 0) {
    const message = `**Missing Translations**\n\nKey: \`${key}\`\nMissing languages: \`${missingLangs.join(
      ', '
    )}\``
    log(`Hover info provided for key: ${key}`)
    return new vscode.Hover(
      new vscode.MarkdownString(message),
      hoveredKeyPosition.range
    )
  }

  log('No missing translations for hovered key')
  return undefined
}
