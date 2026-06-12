# Newest Files

Newest Files is a local Obsidian plugin that lists the newest files added to the vault, including attachments and other non-Markdown files that have never been opened.

## Behavior

- Registers a sidebar view named `newest-files-view`.
- Uses `app.vault.getFiles()` so Markdown files and attachments are part of the same list.
- Maintains a plugin-managed first-seen index in this plugin's `data.json`.
- Handles Obsidian vault events for create, delete, rename and modify.
- Opens files with Obsidian's native `workspace.openFile()` behavior.
- Renders a compact sidebar row as optional timestamp, filename and a subtle extension label.
- Uses Obsidian CSS variables so the view follows the active theme.

## First-seen index

For files created while the plugin is active, the first-seen timestamp is recorded from the live create event. Existing files need a backfill value because Obsidian cannot reconstruct the historical moment they were added to the vault. Backfilled entries use either the file created timestamp or modified timestamp, depending on the setting.

This means:

- Live additions are the most reliable source for "newest added".
- Initial backfill is an approximation.
- Editing a file updates its metadata but does not change its first-seen timestamp.
- Renaming a file preserves the original first-seen timestamp.

## Settings

- Maximum files: number of list items shown.
- Show timestamps: show or hide the leading `HH:mm` column.
- Sort source: first-seen index or modified time.
- Backfill timestamp: created or modified timestamp for existing files.
- Extension filter: optional list such as `md pdf png xlsx`.
- Excluded paths: path prefixes such as `.trash/` or `node_modules/`.

## Development

```bash
npm install
npm run build
npm run lint
npm run typecheck
npm test
```

The generated `main.js`, `manifest.json` and `styles.css` are the files Obsidian loads from the plugin folder.

## CDP smoke route on Windows/WSL

Use this route to prove the plugin through Obsidian's real Electron UI instead of only proving that the process is open. It targets the Windows-local test vault only: `C:\Users\viggo\github\obsidian-test-vault`.

1. Build/copy the plugin runtime into the test vault plugin folder.
2. Close any Obsidian instance that was started without CDP.
3. Launch Obsidian with a Chrome DevTools Protocol port:

```bash
powershell.exe -NoProfile -Command 'Start-Process "$env:LOCALAPPDATA\Programs\Obsidian\Obsidian.exe" -ArgumentList "--remote-debugging-port=9222","obsidian://open?vault=obsidian-test-vault"'
```

4. Run the smoke:

```bash
npm run smoke:cdp
```

When run from WSL, the script automatically delegates to Windows Node so it can reach Obsidian's Windows-local `127.0.0.1:9222` CDP listener.

The smoke attaches to `127.0.0.1:9222` and verifies:

- `obsidian-test-vault` is the open vault.
- `newest-files` is loaded.
- `newest-files:open-newest-files-view` is registered.
- The Newest Files view opens through the command.
- The refresh button is actually clicked in the rendered UI.
- Markdown and non-Markdown fixture files are visible.
- Rename, modify and delete events update the view.

The script writes JSON evidence to stdout and saves a screenshot to `/tmp/newest-files-cdp-smoke-*.png` by default. Override with:

```bash
npm run smoke:cdp -- --port 9223 --screenshot /tmp/newest-files-smoke.png
```
