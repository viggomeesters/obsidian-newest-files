# Obsidian 1.15.1 verification — 16 November 2026

Maintenance patch `0.1.6`. Runtime code is unchanged. The actual desktop host exercised candidate `85719eb95fcaafe6f992ddc9a5e8897baf5bc1c1` with exact source, bundle, manifest and CSS hashes. Production main.js SHA-256: `236df5816931d967a923dd17a5e0e5ba7189093fdba8a2cee7fe237c451e13fb`.

## Exercised behavior

- actual create/modify/rename/delete events update index and modified ordering
- extension/path filters and rebuild exclude unwanted/config files
- timestamp setting rerenders and file button opens correct authored note; source bytes match intended test content
- default test settings/index restored and all three timers removed on unload

## Environment and validation

Tests use fictional fixtures in a fresh own synthetic vault on macOS arm64, the actual Obsidian 1.15.1 renderer and Electron 39.8.3. A bounded own bootstrap separates the CLI socket and test profile. Mock keychain is enabled; the regular application/CLI and installed original bytes are checked separately. Own test windows may be visible and remain unfocused. No OS mouse or keyboard input is used. The renderer uses an emulated 1800×1050 viewport; no native window geometry/throttle commands are used.

Ordinary locked `npm ci`, TypeScript checking, production build, existing test scripts and production dependency audit passed. Checked-in official `eslint-plugin-obsidianmd` 0.6.0 recommended checks cover source and metadata; existing repository lint guards are retained where present. Generated/test harness artifacts are outside the official production-source lint scope. Development tooling is not shipped.

## Scope limits

Default test settings/index are restored and compared in memory and saved JSON; generated synthetic data remains as evidence. Create/modify/rename/delete test operations affect only newly authored synthetic fixtures.

This establishes the exercised 1.15.1 macOS behavior. It does not establish mobile, minimum-version, native-resize, authentication or real keychain behavior. Official Community source/release review, public asset readback and fresh catalog installation remain separate publication gates; a local build or screenshot alone does not establish them.

## Render evidence

![Actual Obsidian 1.15.1 synthetic fixture](../assets/obsidian-1.15.1.png)
