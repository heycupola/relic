---
"@repo/cli": minor
---

Safer runs, clearer errors and a refreshed TUI.

- Endpoint overrides are now `RELIC_CONVEX_URL`, `RELIC_CONVEX_SITE_URL` and `RELIC_SITE_URL`, so a project's own `CONVEX_URL` no longer redirects the CLI.
- `relic run` accepts `--inherit-env` and exits with 127 when the command is not found; signal exits report 128+signal.
- MCP command runs redact secret values from output and time out instead of hanging.
- `whoami` and `projects` exit with 1 on authentication errors; `upgrade` recognizes curl installs.
- The TUI verifies your password on unlock, decrypts values on demand, rejects writes made against a rotated project key and adds shortcuts for editing, saving and navigation.
