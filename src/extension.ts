import * as vscode from 'vscode'
import { Logger } from './utils/logger'
import { TranslationService } from './services/translationService'
import { ConfigService } from './services/configService'
import { DiagnosticService } from './services/diagnosticService'
import { HoverProvider } from './providers/hoverProvider'

// Activate the extension
export function activate(context: vscode.ExtensionContext) {
  const logger = new Logger()
  logger.log('Activating next-intl-hlpr extension')

  // Create services
  const configService = new ConfigService(logger)
  const translationService = new TranslationService(logger)
  const diagnosticCollection =
    vscode.languages.createDiagnosticCollection('next-intl-hlpr')
  const diagnosticService = new DiagnosticService(
    logger,
    translationService,
    configService,
    diagnosticCollection
  )

  // Register hover provider
  const hoverProvider = new HoverProvider(
    logger,
    diagnosticService,
    translationService
  )
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      { scheme: 'file', language: 'json', pattern: '**/*.json' },
      hoverProvider
    )
  )
  logger.log('Hover provider registered')

  // Set up file system watcher
  const translationsFolder = configService.getTranslationsFolder()
  if (!vscode.workspace.workspaceFolders) {
    logger.log('No workspace folders found', new Error('Workspace not open'))
    return
  }

  const watcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(
      vscode.workspace.workspaceFolders[0],
      `${translationsFolder}/**/*.json`
    )
  )
  context.subscriptions.push(watcher)
  logger.log(`File system watcher created for ${translationsFolder}/**/*.json`)

  // Update diagnostics on file system changes
  const updateAllJsonDiagnostics = () => {
    logger.log('File system event triggered, updating diagnostics')
    vscode.workspace.textDocuments.forEach((document) => {
      if (
        document.languageId === 'json' &&
        document.fileName.endsWith('.json')
      ) {
        diagnosticService.updateDiagnostics(document)
      }
    })
  }

  watcher.onDidCreate((uri) => {
    logger.log(`File created: ${uri.fsPath}`)
    updateAllJsonDiagnostics()
  })
  watcher.onDidChange((uri) => {
    logger.log(`File changed: ${uri.fsPath}`)
    updateAllJsonDiagnostics()
  })
  watcher.onDidDelete((uri) => {
    logger.log(`File deleted: ${uri.fsPath}`)
    updateAllJsonDiagnostics()
  })

  // Update diagnostics when a JSON file is opened, saved, or configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((document) => {
      if (
        document.languageId === 'json' &&
        document.fileName.endsWith('.json')
      ) {
        logger.log(`Document opened: ${document.fileName}`)
        diagnosticService.updateDiagnostics(document)
      }
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (
        event.document.languageId === 'json' &&
        event.document.fileName.endsWith('.json')
      ) {
        logger.log(`Document changed: ${event.document.fileName}`)
        diagnosticService.updateDiagnostics(event.document)
      }
    }),
    vscode.workspace.onDidCloseTextDocument((document) => {
      if (
        document.languageId === 'json' &&
        document.fileName.endsWith('.json')
      ) {
        logger.log(`Document closed: ${document.fileName}`)
        diagnosticCollection.delete(document.uri)
        diagnosticService.clearCache(document)
      }
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        event.affectsConfiguration('nextIntlHlpr.translationsFolder') ||
        event.affectsConfiguration('nextIntlHlpr.translationsMode')
      ) {
        logger.log('Configuration changed, updating diagnostics')
        vscode.workspace.textDocuments.forEach((document) => {
          if (
            document.languageId === 'json' &&
            document.fileName.endsWith('.json')
          ) {
            diagnosticService.updateDiagnostics(document)
          }
        })
      }
    })
  )

  // Initial scan of open JSON files
  vscode.workspace.textDocuments.forEach((document) => {
    if (document.languageId === 'json' && document.fileName.endsWith('.json')) {
      logger.log(`Initial scan for document: ${document.fileName}`)
      diagnosticService.updateDiagnostics(document)
    }
  })

  logger.log('Extension activation completed')
}

// Deactivate the extension
export function deactivate() {
  // Cleanup is handled by VS Code's subscription disposal
}
