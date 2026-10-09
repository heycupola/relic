---
"@repo/cli": minor
---

Add `relic shell` to open an interactive subshell with decrypted secrets in its environment, so local commands like `bun run dev` work without a `relic run` prefix or a `.env` file. It accepts the same `-e`, `-f`, `-s`, `-p`, and `--inherit-env` flags as `relic run`, reuses its session, service token, and API key auth plus the local cache, and starts `$SHELL` (falling back to `/bin/sh`, or `%COMSPEC%` on Windows) through the Rust runner so values are never written to disk. The shell sets `RELIC_SHELL=1`, `RELIC_ENVIRONMENT`, and, when known, `RELIC_PROJECT_ID`, `RELIC_FOLDER`, and `RELIC_SCOPE` for prompt integration, refuses to nest unless `--force` is passed, and forwards the shell's exit code.
