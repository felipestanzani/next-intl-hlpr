import * as vscode from 'vscode';
import * as jsonc from 'jsonc-parser';
import * as fs from 'fs/promises';

// Re-usable key extractor from previous examples
function extractKeyPaths(obj: any, prefix: string = ''): string[] {
  let paths: string[] = [];
  for (const key in obj) {
    if (Object.hasOwn(obj, key)) {
      const newPath = prefix ? `${prefix}.${key}` : key;
      if (
        typeof obj[key] === 'object' &&
        obj[key] !== null &&
        !Array.isArray(obj[key])
      ) {
        paths = paths.concat(extractKeyPaths(obj[key], newPath));
      } else {
        paths.push(newPath);
      }
    }
  }
  return paths;
}

// A map to hold the parsed content of our i18n files
type I18nDataMap = Map<string, {content: any; keyPaths: Set<string>}>;

export class I18nAnalyzer {
  /**
   * Finds and reads all i18n files matching the user-defined pattern.
   */
  private async getAllI18nData(
    currentDocument: vscode.TextDocument
  ): Promise<I18nDataMap> {
    const config = vscode.workspace.getConfiguration('i18n-compare');
    const pattern = config.get<string>('filePattern', '**/i18n/*.json');
    const uris = await vscode.workspace.findFiles(pattern);

    const dataMap: I18nDataMap = new Map();

    for (const uri of uris) {
      // Use current document's text if it's the one being processed
      const contentString =
        uri.fsPath === currentDocument.uri.fsPath
          ? currentDocument.getText()
          : await fs.readFile(uri.fsPath, 'utf-8');

      try {
        const content = jsonc.parse(contentString);
        const keyPaths = new Set(extractKeyPaths(content));
        // Use relative path for cleaner display
        const relativePath = vscode.workspace.asRelativePath(uri);
        dataMap.set(relativePath, {content, keyPaths});
      } catch (e) {
        console.error(`Could not parse ${uri.fsPath}`);
      }
    }
    return dataMap;
  }

  /**
   * The main method to generate all diagnostics for a given document.
   */
  public async analyze(
    document: vscode.TextDocument
  ): Promise<vscode.Diagnostic[]> {
    const diagnostics: vscode.Diagnostic[] = [];
    const allData = await this.getAllI18nData(document);
    const currentRelativePath = vscode.workspace.asRelativePath(document.uri);
    const currentData = allData.get(currentRelativePath);

    if (!currentData) {
      return [];
    }

    const otherFilesData = new Map(allData);
    otherFilesData.delete(currentRelativePath);

    // Parse the current document with location info
    const rootNode = jsonc.parseTree(document.getText());
    if (!rootNode) {
      return [];
    }

    // 1. Check for missing parent keys on the opening brace
    diagnostics.push(
      ...this.findMissingParentKeys(rootNode, currentData, otherFilesData)
    );

    // 2. Traverse the AST to check each key
    jsonc.visit(document.getText(), {
      onObjectProperty: (
        property,
        offset,
        length,
        startLine,
        startCharacter
      ) => {
        const keyNode = jsonc.findNodeAtOffset(rootNode, offset);
        if (keyNode) {
          const range = new vscode.Range(
            new vscode.Position(startLine, startCharacter),
            new vscode.Position(startLine, startCharacter + length)
          );
          const keyPath = jsonc.getNodePath(keyNode).join('.');

          // 2a. Check for missing immediate sub-keys
          diagnostics.push(
            ...this.findMissingSubKeys(
              keyNode,
              keyPath,
              currentData,
              otherFilesData,
              range
            )
          );

          // 2b. Check if this key is missing in other files
          diagnostics.push(
            ...this.findKeyMissingInOthers(keyPath, otherFilesData, range)
          );
        }
      }
    });

    return diagnostics;
  }

  private findMissingParentKeys(
    rootNode: jsonc.Node,
    currentData: any,
    otherFilesData: I18nDataMap
  ): vscode.Diagnostic[] {
    const missing: string[] = [];
    const currentTopLevelKeys = new Set(Object.keys(currentData.content));

    otherFilesData.forEach((data) => {
      Object.keys(data.content).forEach((key) => {
        if (!currentTopLevelKeys.has(key)) {
          missing.push(key);
        }
      });
    });

    if (missing.length > 0) {
      const uniqueMissing = [...new Set(missing)];
      const range = new vscode.Range(
        new vscode.Position(0, 0),
        new vscode.Position(0, 1)
      ); // The opening brace
      return [
        new vscode.Diagnostic(
          range,
          `Missing parent keys found in other files: ${uniqueMissing.join(', ')}`,
          vscode.DiagnosticSeverity.Warning
        )
      ];
    }
    return [];
  }

  private findMissingSubKeys(
    keyNode: jsonc.Node,
    keyPath: string,
    currentData: any,
    otherFilesData: I18nDataMap,
    range: vscode.Range
  ): vscode.Diagnostic[] {
    const valueNode = keyNode.parent?.children?.[1];
    if (!valueNode || valueNode.type !== 'object') {
      return []; // Only check for subkeys if the value is an object
    }

    const currentSubKeys = new Set(
      valueNode.children?.map((p) => p.children![0].value) ?? []
    );
    const missingSubKeys: string[] = [];

    otherFilesData.forEach((data) => {
      // Find the corresponding object in the other file
      let otherObj = data.content;
      for (const part of keyPath.split('.')) {
        otherObj = otherObj?.[part];
      }

      if (typeof otherObj === 'object' && otherObj !== null) {
        Object.keys(otherObj).forEach((subKey) => {
          if (!currentSubKeys.has(subKey)) {
            missingSubKeys.push(subKey);
          }
        });
      }
    });

    if (missingSubKeys.length > 0) {
      const uniqueMissing = [...new Set(missingSubKeys)];
      return [
        new vscode.Diagnostic(
          range,
          `Missing sub-keys: ${uniqueMissing.join(', ')}`,
          vscode.DiagnosticSeverity.Warning
        )
      ];
    }
    return [];
  }

  private findKeyMissingInOthers(
    keyPath: string,
    otherFilesData: I18nDataMap,
    range: vscode.Range
  ): vscode.Diagnostic[] {
    const missingInFiles: string[] = [];
    otherFilesData.forEach((data, fileName) => {
      if (!data.keyPaths.has(keyPath)) {
        missingInFiles.push(fileName.split('/').pop()!); // Get just the filename
      }
    });

    if (missingInFiles.length > 0) {
      return [
        new vscode.Diagnostic(
          range,
          `Key is missing in: ${missingInFiles.join(', ')}`,
          vscode.DiagnosticSeverity.Warning
        )
      ];
    }
    return [];
  }
}
