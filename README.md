# next-intl-hlpr

![next-intl-hlpr Logo](images/banner.png)

A VS Code extension to highlight missing translations in `next-intl` JSON files and show missing languages on hover.

Download at [VSCode Marketplace](https://marketplace.visualstudio.com/items?itemName=felipestanzani.next-intl-hlpr)

## Features

- Highlights JSON keys missing in other language files, including nested properties (e.g., `nested.message`).
- Shows missing languages on hover for warned keys.
- Supports two translation file structures:
  - **Single-File Mode**: One JSON file per language (e.g., `messages/en.json`, `messages/de.json`).
  - **Folder Mode**: Language-specific subfolders with multiple JSON files (e.g., `messages/en/common.json`, `messages/en/errors.json`).
- In folder mode, compares only equivalent files (e.g., `en/common.json` with `de/common.json`, not `de/errors.json`).
- Configurable translations folder path and mode via settings.
- Dynamically updates diagnostics when translation files (`*.json`) are created, renamed, or deleted within the translations folder.
- Handles complex JSON structures, including nested objects and escaped keys.
- Treats empty strings (`""`) as missing translations for stricter validation.
- Optimized performance with caching for large translation files and frequent hover interactions.

## Requirements

- Translation files must be organized in one of two ways:
  - **Single-File Mode**: JSON files directly in the translations folder, named by language (e.g., `messages/en.json`).
  - **Folder Mode**: Language-specific subfolders containing one or more JSON files (e.g., `messages/en/common.json`).
- The extension detects the structure automatically (`auto` mode prioritizes folder mode) or uses the configured mode.
- A workspace folder must be open in VS Code.
- JSON files must be valid (malformed JSON will trigger an error notification).
- The extension uses `jsonc-parser` for robust JSON parsing. If building from source, ensure `jsonc-parser` is installed (`npm install jsonc-parser`).

## Extension Settings

This extension contributes the following settings:

- `nextIntlHlpr.translationsFolder`: Path to the folder containing translation files (relative to workspace root). Defaults to `messages`.
- `nextIntlHlpr.translationsMode`: Preferred mode for translation files. Options:
  - `auto`: Detects based on folder contents, prioritizing folder mode (subfolders) over single-file mode (default).
  - `single-file`: Expects one JSON file per language (e.g., `en.json`).
  - `folder`: Expects language subfolders with JSON files (e.g., `en/common.json`).
- Language codes (e.g., `en`, `de`) are derived from file names (single-file mode) or folder names (folder mode). Ensure names match across languages for accurate comparisons. Future versions may support configurable language code validation.

## Installation

1. Install the extension from the VS Code Marketplace or by sideloading the `.vsix` file.
2. Ensure your translation files are in the `messages` folder (or configure `nextIntlHlpr.translationsFolder`).
3. Open a JSON translation file to start seeing diagnostics and hover information.

## Usage

1. Place translation JSON files in a folder (e.g., `messages/` or as configured) using one of these structures:
   ```
   // Single-File Mode
   messages/
   ├── en.json
   ├── de.json
   ```
   ```
   // Folder Mode
   messages/
   ├── en/
   │ ├── common.json
   │ ├── errors.json
   ├── de/
   │ ├── common.json
   ```
2. Configure the mode in VS Code settings if needed:
   - Go to **Preferences > Settings** and search for `nextIntlHlpr`.
   - Set `nextIntlHlpr.translationsMode` to `single-file` or `folder` to enforce a mode, or leave as `auto`.
   - Set `nextIntlHlpr.translationsFolder` if your translations are not in `messages`.
3. Open a JSON file to see warnings for missing translations.
4. Hover over a warned key to see missing languages.
5. Rename, add, or delete translation files, and diagnostics will update automatically.

## Migration Example

If migrating from single-file to folder mode:

1. Start with single-file structure:
   ```
   messages/
   ├── en.json
   ├── de.json
   ```
2. Set `nextIntlHlpr.translationsMode` to `single-file` in settings.
3. Move files to folders:
   ```
   messages/
   ├── en/
   │ ├── common.json
   ├── de/
   │ ├── common.json
   ```
4. Change `nextIntlHlpr.translationsMode` to `folder` or leave as `auto` (it will prioritize folder mode).
5. The extension will process the new structure and update diagnostics dynamically.

## Example

### Single-File Mode

**messages/en.json**:

```json
{
  "greeting": "Hello",
  "nested": { "message": "Nested message" }
}
```

**messages/de.json**:

```json
{
  "greeting": "Hallo"
}
```

Opening `messages/en.json` will show a warning on `nested.message` (missing in `de`). Hovering over `nested.message` shows:

```
**Missing Translations**
Key: `nested.message`
Missing languages: `de`
```

### Folder Mode

**messages/en/common.json**:

```json
{
  "greeting": "Hello",
  "nested": { "message": "Nested message" }
}
```

**messages/en/errors.json**:

```json
{
  "error404": "Not Found"
}
```

**messages/de/common.json**:

```json
{
  "greeting": "Hallo"
}
```

Opening `messages/en/common.json` will show a warning on `nested.message` (missing in `de/common.json`). Hovering over `nested.message` shows:

```
**Missing Translations**
Key: `nested.message`
Missing languages: `de`
```

Renaming `common.json` to `newCommon.json` will automatically update diagnostics to compare `en/newCommon.json` with `de/newCommon.json`.

## Troubleshooting

- **No diagnostics appear**:
  - Ensure the translations folder exists and is correctly configured (`nextIntlHlpr.translationsFolder`).
  - Verify the file structure matches the mode (`single-file` or `folder`).
  - Check the VS Code console (`Developer: Toggle Developer Tools`) for errors.
- **Diagnostics don’t update after renaming files**:
  - Ensure a workspace folder is open.
  - Restart VS Code to reinitialize the file system watcher if changes are not detected.
- **Errors about malformed JSON**:
  - Fix invalid JSON in the reported file (notifications will show the file path).
- **Performance issues**:
  - For large translation files, ensure `nextIntlHlpr.translationsMode` is set correctly to avoid unnecessary processing.

## Known Limitations

- Language codes (e.g., `en`, `de`) are not validated; any folder or file name is treated as a language.
- JSONC (JSON with comments) is parsed correctly, but comments are ignored and do not affect translation key detection.
- Multi-root workspaces use the first workspace folder containing the translations folder.

## Release Notes

### 0.0.3

- Fixed issue where diagnostics didn’t update after renaming files in folder mode (e.g., `api-message.json` to `apiMessage.json`).
- Added file system watcher to dynamically update diagnostics on file creation, deletion, or rename.
- Improved JSON parsing with `jsonc-parser` for robust handling of nested keys and complex JSON.
- Added caching to improve performance for diagnostics and hover information.
- Enhanced error handling with notifications for malformed JSON files.
- Treated empty strings (`""`) as missing translations.
- Optimized configuration change handling to avoid unnecessary updates.
- Improved path handling for cross-platform compatibility (Windows, Linux, macOS).
- Added support for multi-root workspaces.

### 0.0.1

- Initial release with missing translation detection and hover info.

## Contributing

Contributions are welcome! Please open an issue or pull request on the [GitHub repository](https://github.com/felipestanzani/next-intl-hlpr).

## License

MIT License. See [LICENSE](LICENSE) for details.
