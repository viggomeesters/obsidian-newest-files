# Changelog

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
