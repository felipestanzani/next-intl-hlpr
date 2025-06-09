# Release Notes

## Version 0.0.5 (Unreleased)

### Improvements

- **Restored `jsonc-parser` Support**: Reintroduced the `jsonc-parser` library for handling JSON files with comments and trailing commas. This makes the extension more flexible when working with translation files that include developer comments or follow more relaxed JSON formatting.
- **Enhanced JSON Parsing**: The extension now properly handles JSON files with comments, trailing commas, and other JSONC features, improving developer experience when maintaining translation files.
- **Bundled `jsonc-parser`**: Now bundling the complete `jsonc-parser` library with the extension to ensure it's always available, preventing "Cannot find module" errors in production environments.
- **Improved Build Process**: Switched from TypeScript compilation to esbuild for better bundling and production builds.
- **Fixed Module Resolution**: Implemented comprehensive packaging of jsonc-parser's module structure to ensure proper resolution of all nested dependencies and prevent module import errors.

### Known Limitations

- The key position parser for diagnostics and hover has been improved with the jsonc-parser implementation.

## Version 0.0.4 (April 30, 2025)

### Bug Fixes

- **Fixed Production Failure**: Resolved an issue where the extension failed to activate in production due to a missing `jsonc-parser` dependency (`Cannot find module 'jsonc-parser'`). The extension now works reliably when installed as a `.vsix` or from the VSCode Marketplace.
- **Removed `jsonc-parser` Dependency**: Replaced `jsonc-parser` with Node's built-in `JSON.parse` for parsing translation JSON files, eliminating external dependencies and simplifying bundling. This ensures compatibility with standard JSON files but requires valid JSON (no comments or trailing commas).

### Improvements

- **Enhanced Logging**: Added detailed logging to the `next-intl-hlpr` Output channel to aid debugging. Logs include activation, file loading, and diagnostics events, making it easier to diagnose issues.
- **Improved Activation**: Added `onStartupFinished` to activation events, ensuring reliable activation even if JSON files are not immediately opened.
- **Manual Diagnostics Refresh**: Introduced the `nextIntlHlpr.refreshDiagnostics` command to manually trigger diagnostics updates via the Command Palette.

### Known Limitations

- The JSON parser requires valid JSON without comments or trailing commas. Ensure your translation files are standard-compliant to avoid parsing errors.
- The key position parser for diagnostics and hover is simpler than the previous `jsonc-parser` implementation. Report any misaligned diagnostics with sample JSON files.

## Previous Releases

### Version 0.0.2

- Initial diagnostics and hover support for translation JSON files.
