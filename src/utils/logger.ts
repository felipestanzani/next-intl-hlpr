import * as vscode from 'vscode'

export class Logger {
  private readonly outputChannel: vscode.OutputChannel

  constructor() {
    this.outputChannel = vscode.window.createOutputChannel('next-intl-hlpr')
  }

  log(message: string, error?: any): void {
    const timestamp = new Date().toISOString()
    this.outputChannel.appendLine(`[${timestamp}] ${message}`)
    if (error) {
      this.outputChannel.appendLine(
        `[${timestamp}] Error: ${error.message ?? error}`
      )
      console.error(error)
    }
  }

  dispose(): void {
    this.outputChannel.dispose()
  }
}
