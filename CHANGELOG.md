# Changelog

## 0.1.3

- Stopped detaching custom view leaves during `onunload`, preserving user pane placement across plugin reloads.
- Removed `workspace.revealLeaf` usage so the plugin stays compatible with the declared `minAppVersion`.
- Replaced the settings tab HTML heading with `new Setting(containerEl).setName(...).setHeading()` for Community UI consistency.
- Hardened `npm run community:check` to catch these automatic-review failures before release.

## 0.1.2

- Debounced refresh work so repeated vault events update the view without excessive rerenders.
- Preserved newest-file behavior for Markdown and non-Markdown vault files.

## 0.1.1

- Repaired startup behavior in the Windows-local test vault.
- Added deterministic test-vault sync and Obsidian CDP smoke coverage.

## 0.1.0

- Initial Newest Files view.
- Listed Markdown files and attachments together from Obsidian's vault API.
- Added plugin-managed first-seen timestamps, settings, and vault event handling.
