import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'

// Interface for translation JSON structure
interface Translation {
  [key: string]: string | Translation
}

// Activate the extension
export function activate(context: vscode.ExtensionContext) {
  console.log('Extension "next-intl-hlpr" is now active!')

  // Create a diagnostic collection for missing translations
  const diagnosticCollection =
    vscode.languages.createDiagnosticCollection('next-intl-hlpr')
  context.subscriptions.push(diagnosticCollection)

  // Register hover provider for JSON files
  const hoverProvider = vscode.languages.registerHoverProvider(
    { scheme: 'file', language: 'json', pattern: '**/*.json' },
    {
      provideHover(document, position) {
        return provideHoverInfo(document, position)
      }
    }
  )
  context.subscriptions.push(hoverProvider)

  // Update diagnostics when a JSON file is opened, saved, or configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((document) => {
      if (document.languageId === 'json') {
        updateDiagnostics(document, diagnosticCollection)
      }
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.languageId === 'json') {
        updateDiagnostics(event.document, diagnosticCollection)
      }
    }),
    vscode.workspace.onDidCloseTextDocument((document) => {
      if (document.languageId === 'json') {
        diagnosticCollection.delete(document.uri)
      }
    }),
    vscode.workspace.onDidChangeConfiguration(() => {
      vscode.workspace.textDocuments.forEach((document) => {
        if (document.languageId === 'json') {
          updateDiagnostics(document, diagnosticCollection)
        }
      })
    })
  )

  // Initial scan of open JSON files
  vscode.workspace.textDocuments.forEach((document) => {
    if (document.languageId === 'json') {
      updateDiagnostics(document, diagnosticCollection)
    }
  })
}

// Deactivate the extension
export function deactivate() {
  // just for avoid sonarlint error
}

// Get the configured translations folder
function getTranslationsFolder(): string {
  const config = vscode.workspace.getConfiguration('nextIntlHlpr')
  return config.get('translationsFolder', 'messages')
}

// Get the configured translations mode
function getTranslationsMode(): string {
  const config = vscode.workspace.getConfiguration('nextIntlHlpr')
  return config.get('translationsMode', 'auto')
}

// Find the translations folder in the workspace
function findTranslationsFolder(): string | undefined {
  const workspaceFolders = vscode.workspace.workspaceFolders
  if (!workspaceFolders) {
    return undefined
  }

  const rootPath = workspaceFolders[0].uri.fsPath
  const translationsFolder = getTranslationsFolder()
  const translationsPath = path.join(rootPath, translationsFolder)
  if (
    fs.existsSync(translationsPath) &&
    fs.lstatSync(translationsPath).isDirectory()
  ) {
    return translationsPath
  }
  return undefined
}

// Determine if the translations folder uses single files
function isSingleFileMode(translationsPath: string): boolean {
  const mode = getTranslationsMode()
  if (mode === 'single-file') {
    return true
  } else if (mode === 'folder') {
    return false
  }
  // Auto mode: prioritize folder mode (subfolders) over single-file mode
  const contents = fs.readdirSync(translationsPath)
  const hasSubfolders = contents.some((item) => {
    const itemPath = path.join(translationsPath, item)
    return fs.lstatSync(itemPath).isDirectory()
  })
  if (hasSubfolders) {
    return false // Prioritize folder mode
  }
  return contents.some((item) => item.endsWith('.json')) // Fallback to single-file mode
}

// Load a single translation file
function loadSingleTranslation(filePath: string): Translation {
  try {
    const content = fs.readFileSync(filePath, 'utf8')
    return JSON.parse(content)
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error)
    return {}
  }
}

// Load all translation files for a language in folder mode (equivalent files only)
function loadEquivalentTranslations(
  langPath: string,
  fileName: string
): Translation {
  const filePath = path.join(langPath, fileName)
  if (fs.existsSync(filePath)) {
    return loadSingleTranslation(filePath)
  }
  return {}
}

// Load all translations
function loadTranslations(
  translationsPath: string,
  isSingleFile: boolean,
  fileName?: string
): Map<string, Translation> {
  const translations = new Map<string, Translation>()

  if (isSingleFile) {
    // Single-file mode: each .json file is a language
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
    // Folder mode: each subfolder is a language, compare equivalent files only
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

  return translations
}

// Flatten nested object keys (handles nested properties)
function getAllKeys(obj: Translation, prefix: string = ''): string[] {
  const keys: string[] = []
  for (const key in obj) {
    const fullKey = prefix ? `${prefix}.${key}` : key
    if (typeof obj[key] === 'string') {
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
  return typeof current === 'string'
}

// Interface for key position in JSON
interface KeyPosition {
  key: string
  range: vscode.Range
}

// Find all keys and their positions in the JSON document
function findKeysInDocument(document: vscode.TextDocument): KeyPosition[] {
  const text = document.getText()
  let parsed: Translation
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    console.error('Error parsing JSON:', error)
    return []
  }

  const positions: KeyPosition[] = []
  const lines = text.split('\n')

  function traverse(
    obj: Translation,
    prefix: string = '',
    lineOffset: number = 0,
    charOffset: number = 0
  ) {
    for (const key in obj) {
      const fullKey = prefix ? `${prefix}.${key}` : key
      const value = obj[key]

      // Find the key in the text
      const keyPattern = `"${key}"\\s*:`
      let currentLine = lineOffset
      let found = false
      let keyStart: vscode.Position | undefined
      let keyEnd: vscode.Position | undefined

      while (currentLine < lines.length) {
        const line = lines[currentLine]
        const match = RegExp(keyPattern).exec(line)
        if (match?.index !== undefined) {
          keyStart = new vscode.Position(currentLine, match.index)
          keyEnd = new vscode.Position(
            currentLine,
            match.index + key.length + 2
          ) // Include quotes
          found = true
          break
        }
        currentLine++
      }

      if (found && keyStart && keyEnd) {
        if (typeof value === 'string') {
          positions.push({
            key: fullKey,
            range: new vscode.Range(keyStart, keyEnd)
          })
        } else if (typeof value === 'object' && value !== null) {
          // Recursively traverse nested objects
          const nextLine = currentLine + 1
          const nextCharOffset = lines[currentLine].indexOf('{') + 1
          traverse(value, fullKey, nextLine, nextCharOffset)
        }
      }

      // Update offsets for the next key
      if (found) {
        lineOffset = currentLine
      }
    }
  }

  traverse(parsed)
  return positions
}

// Update diagnostics for a document
function updateDiagnostics(
  document: vscode.TextDocument,
  collection: vscode.DiagnosticCollection
) {
  if (!document.fileName.endsWith('.json')) {
    return
  }

  const translationsPath = findTranslationsFolder()
  if (!translationsPath) {
    collection.clear()
    return
  }

  const isSingleFile = isSingleFileMode(translationsPath)
  let lang: string
  let fileName: string | undefined

  // Determine the language and file name
  const translationsFolder = getTranslationsFolder()
  const relativePath = path.relative(
    path.join(
      vscode.workspace.workspaceFolders![0].uri.fsPath,
      translationsFolder
    ),
    document.fileName
  )

  if (isSingleFile) {
    // Single-file mode: language is the file name without .json
    if (!RegExp(/^[./\\]*$/).exec(path.dirname(relativePath))) {
      return // File is not directly in translationsFolder
    }
    lang = path.basename(document.fileName, '.json')
  } else {
    // Folder mode: language is the first folder, fileName is the JSON file
    const pathParts = relativePath.split(path.sep)
    if (pathParts.length < 2) {
      return // Not in a language subfolder
    }
    lang = pathParts[0]
    fileName = pathParts.slice(1).join(path.sep) // e.g., "view.json"
  }

  // Load translations (pass fileName in folder mode to compare equivalent files only)
  const translations = loadTranslations(
    translationsPath,
    isSingleFile,
    fileName
  )
  const missingTranslations = findMissingTranslations(translations)

  const diagnostics: vscode.Diagnostic[] = []
  const translation = translations.get(lang)
  if (!translation) {
    return
  }

  // Find all keys and their positions in the document
  const keyPositions = findKeysInDocument(document)

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

  collection.set(document.uri, diagnostics)
}

// Provide hover information
function provideHoverInfo(
  document: vscode.TextDocument,
  position: vscode.Position
): vscode.Hover | undefined {
  if (!document.fileName.endsWith('.json')) {
    return undefined
  }

  const translationsPath = findTranslationsFolder()
  if (!translationsPath) {
    return undefined
  }

  const isSingleFile = isSingleFileMode(translationsPath)
  let fileName: string | undefined

  if (!isSingleFile) {
    const translationsFolder = getTranslationsFolder()
    const relativePath = path.relative(
      path.join(
        vscode.workspace.workspaceFolders![0].uri.fsPath,
        translationsFolder
      ),
      document.fileName
    )
    const pathParts = relativePath.split(path.sep)
    if (pathParts.length >= 2) {
      fileName = pathParts.slice(1).join(path.sep) // e.g., "view.json"
    }
  }

  const translations = loadTranslations(
    translationsPath,
    isSingleFile,
    fileName
  )
  const missingTranslations = findMissingTranslations(translations)

  // Find all keys and their positions
  const keyPositions = findKeysInDocument(document)

  // Find the key at the cursor position
  const hoveredKeyPosition = keyPositions.find((kp) =>
    kp.range.contains(position)
  )
  if (!hoveredKeyPosition) {
    return undefined
  }

  const key = hoveredKeyPosition.key
  const missingLangs = missingTranslations.get(key)
  if (missingLangs && missingLangs.length > 0) {
    const message = `**Missing Translations**\n\nKey: \`${key}\`\nMissing languages: \`${missingLangs.join(
      ', '
    )}\``
    return new vscode.Hover(
      new vscode.MarkdownString(message),
      hoveredKeyPosition.range
    )
  }

  return undefined
}
