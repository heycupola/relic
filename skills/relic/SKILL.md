---
name: relic
description: Manage, check, sync, and inject end-to-end encrypted environment variables with Relic without reading or writing plaintext .env files. Use when running commands that need secrets, checking missing environment variables, scanning for leaked secrets, or syncing variables to Vercel, Cloudflare, GitHub Actions, or Fly.io.
---

# Relic

Relic is a client-side encrypted secrets manager. Secret values are encrypted on the user's device and injected at runtime into child processes by a native Rust runner.

Never read, print, or write plaintext `.env` files when working in a repository that uses Relic (`relic.toml`).

## MCP Tools (`relic mcp`)

When the `relic` MCP server is connected, prefer its tools over shell commands:

- `get-current-project`: read `relic.toml` in the current workspace to find the `projectId`.
- `list-projects`: list accessible projects, environments (`development`, `staging`, `production`), and folders.
- `list-secrets`: list secret key names and scopes in an environment. Returns names only, never secret values.
- `run-with-secrets`: run a command (for example `["bun", "test"]` or `["npm", "run", "build"]`) with secrets injected. Decrypted values are best-effort redacted from `stdout` and `stderr` as `[REDACTED:KEY]` (verbatim matches of values with 4+ characters only). Common env dumps (`env`, `printenv`, bare `set`, PowerShell `Env:`) are refused unless `allowDangerousEnvDump=true`.

## CLI Commands

If you are running commands in a terminal:

```bash
# Check which secret names exist in an environment (never prints values)
relic secrets -e development

# Verify required keys from .env.example and source code exist in Relic
relic check -e production --scan src

# Run a command with secrets injected in memory
relic run -e development -- bun test

# Scan staged changes for leaked secret values or .env files before committing
relic guard scan --staged

# Preview syncing secrets to Vercel, Cloudflare Workers, GitHub Actions, or Fly.io
relic push -e production --target vercel --dry-run
```

## Rules for AI Agents

1. **Never dump environment variables:** Do not run `env`, `printenv`, or `console.log(process.env)` inside `relic run` to inspect secret values.
2. **Use `relic check` for missing variable errors:** If a build or test fails due to a missing environment variable, run `relic secrets -e <env>` or `relic check -e <env> --scan` to check whether the key name exists.
3. **Use `--dry-run` before pushing:** Always run `relic push -e <env> --target <platform> --dry-run` and show the diff plan to the user before running a live push.
