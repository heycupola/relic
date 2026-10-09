---
"@repo/cli": minor
"@repo/backend": minor
---

Add `relic check` to catch missing environment variables before a deploy. It compares required key names from `.env.example`, `.env.sample`, `.env.template`, `--from` files, and optional `--scan` of JS/TS/Python sources with the secrets in an environment, and exits non-zero when a key is missing. `--compare <env>` shows key-name drift between two environments, `--strict` also fails on unused keys and drift, and `--json` prints a machine-readable report. Keys can be skipped with `--ignore` or `[check] ignore` in `relic.toml`. The command reads names only and never fetches or decrypts values; the backend adds a names-only `secret.listSecretNames` query plus `/api/secrets/names` (API key) and `/api/sa/secrets/names` (service token) routes that enforce the same access rules as export.
