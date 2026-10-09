---
"@repo/cli": minor
---

Add `relic import` for moving secrets into Relic in one command. It reads dotenv files (comments, `export`, all quote styles, multiline values, escapes), JSON in the TUI format or as a flat object, stdin, and the Doppler, Infisical, Vercel, and 1Password sources. Values are encrypted on your device before upload. A names-only plan shows new, changed, unchanged, skipped, and invalid secrets, and `--overwrite`, `--skip-existing`, and `--dry-run` control what gets written.
