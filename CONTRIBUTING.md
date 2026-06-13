# Contributing

Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run sync:test-vault`, `npm run smoke:cdp`, and `npm run community:check` before opening a PR.

Keep the plugin one-purpose: Newest Files is a local newest-file navigation view. Do not bundle unrelated File Explorer, viewer, or file-management behavior into this plugin.

Never test plugin runtime artifacts in the main Life OS vault. Use only the Windows-local `obsidian-test-vault` documented in the README.
