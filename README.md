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
