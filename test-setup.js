// Mock VSCode module for unit tests
const Module = require('module');

// Store the original require function
const originalRequire = Module.prototype.require;

// Create mock functions that can be spied on - these will be replaced by sinon stubs in tests
const mockCreateOutputChannel = () => ({
  appendLine: () => {},
  dispose: () => {},
  clear: () => {},
  hide: () => {},
  show: () => {},
  name: 'test',
  replace: () => {},
  append: () => {}
});

const mockCreateFileSystemWatcher = () => ({
  onDidChange: () => {},
  onDidCreate: () => {},
  onDidDelete: () => {},
  dispose: () => {}
});

const mockCreateDiagnosticCollection = () => ({
  set: () => {},
  delete: () => {},
  clear: () => {},
  dispose: () => {}
});

// Store the vscode mock object so it can be reused and stubbed
let vscodeMock;

// Override require to mock vscode
Module.prototype.require = function (id) {
  if (id === 'vscode') {
    if (!vscodeMock) {
      vscodeMock = {
        // Mock classes
        Position: class Position {
          constructor(line, character) {
            this.line = line;
            this.character = character;
          }
        },
        Range: class Range {
          constructor(start, end) {
            this.start = start;
            this.end = end;
          }
        },
        Uri: {
          file: (path) => ({fsPath: path, path})
        },
        Hover: class Hover {
          constructor(contents, range) {
            this.contents = Array.isArray(contents) ? contents : [contents];
            this.range = range;
          }
        },
        MarkdownString: class MarkdownString {
          constructor(value) {
            this.value = value || '';
          }
          appendMarkdown(value) {
            this.value += value;
          }
        },
        Diagnostic: class Diagnostic {
          constructor(range, message, severity) {
            this.range = range;
            this.message = message;
            this.severity = severity;
          }
        },
        DiagnosticSeverity: {
          Error: 0,
          Warning: 1,
          Information: 2,
          Hint: 3
        },
        EndOfLine: {
          LF: 1,
          CRLF: 2
        },
        ExtensionMode: {
          Production: 1,
          Development: 2,
          Test: 3
        },
        RelativePattern: class RelativePattern {
          constructor(base, pattern) {
            this.base = base;
            this.pattern = pattern;
          }
        },
        // Mock namespaces
        window: {
          createOutputChannel: mockCreateOutputChannel
        },
        workspace: {
          getConfiguration: () => ({
            get: () => undefined
          }),
          createFileSystemWatcher: mockCreateFileSystemWatcher,
          onDidChangeConfiguration: () => {},
          openTextDocument: () => Promise.resolve({}),
          getWorkspaceFolder: () => undefined,
          workspaceFolders: [],
          textDocuments: []
        },
        languages: {
          createDiagnosticCollection: mockCreateDiagnosticCollection
        }
      };
    }
    return vscodeMock;
  }
  return originalRequire.apply(this, arguments);
};
