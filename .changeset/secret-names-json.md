---
"@repo/cli": minor
---

Add `relic secrets -e <env>` to list secret names and scopes in an environment (never values), and `--json` output for `relic secrets` and `relic projects` (plus `relic projects --project <id>`). JSON errors are printed as `{"error": {"code", "message"}}` with exit code 1, so editors and scripts can tell "not logged in" from other failures.
