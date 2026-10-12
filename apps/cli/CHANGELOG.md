# @repo/cli

## 0.10.0

### Minor Changes

- aac60a8: Add `relic guard` to block commits that leak secrets. `relic guard scan` flags committed or staged dotenv files and exact occurrences of your decrypted Relic secret values, matched locally with a multi-pattern search. It scans paths, staged content (`--staged`), or lines added in a commit range (`--range`), prints only key names, locations, and masked previews, supports `--json`, and exits non-zero on findings. `relic guard install` adds a pre-commit hook that chains any existing hook, or prints the snippet for lefthook, husky, and pre-commit (and can edit `lefthook.yml` with consent). Findings can be silenced with a `relic-guard-ignore` comment or a `.relicguardignore` file, and dotenv files can be allowed via `[guard] allow` in `relic.toml`.
- aac60a8: Safer runs, clearer errors and a refreshed TUI.

  - Endpoint overrides are now `RELIC_CONVEX_URL`, `RELIC_CONVEX_SITE_URL` and `RELIC_SITE_URL`, so a project's own `CONVEX_URL` no longer redirects the CLI.
  - `relic run` accepts `--inherit-env` and exits with 127 when the command is not found; signal exits report 128+signal.
  - MCP command runs redact secret values from output and time out instead of hanging.
  - `whoami` and `projects` exit with 1 on authentication errors; `upgrade` recognizes curl installs.
  - Shared projects are now read-only for collaborators; only the owner can create, rename or delete environments, folders and secrets.
  - The TUI verifies your password on unlock, decrypts values on demand, rejects writes made against a rotated project key and adds shortcuts for editing, saving and navigation.

- aac60a8: Add `relic check` to catch missing environment variables before a deploy. It compares required key names from `.env.example`, `.env.sample`, `.env.template`, `--from` files, and optional `--scan` of JS/TS/Python sources with the secrets in an environment, and exits non-zero when a key is missing. `--compare <env>` shows key-name drift between two environments, `--strict` also fails on unused keys and drift, and `--json` prints a machine-readable report. Keys can be skipped with `--ignore` or `[check] ignore` in `relic.toml`. The command reads names only and never fetches or decrypts values; the backend adds a names-only `secret.listSecretNames` query plus `/api/secrets/names` (API key) and `/api/sa/secrets/names` (service token) routes that enforce the same access rules as export.
- aac60a8: Add `relic import` for moving secrets into Relic in one command. It reads dotenv files (comments, `export`, all quote styles, multiline values, escapes), JSON in the TUI format or as a flat object, stdin, and the Doppler, Infisical, Vercel, and 1Password sources. Values are encrypted on your device before upload. A names-only plan shows new, changed, unchanged, skipped, and invalid secrets, and `--overwrite`, `--skip-existing`, and `--dry-run` control what gets written.
- aac60a8: Add `relic push` to sync an environment's secrets into a deploy platform's secret store. Supported targets are Vercel (REST API, using `VERCEL_TOKEN` or the Vercel CLI login), Cloudflare Workers (`wrangler secret bulk` on stdin, with a `CLOUDFLARE_API_TOKEN` API fallback), GitHub Actions (`gh secret set`, repository or environment level), and Fly.io (`fly secrets import`). Values are decrypted locally and sent only to the platform, never written to disk or printed. A names-only plan is shown before writing, `--dry-run` stops after the plan, production-like targets ask for confirmation, CI requires `--yes`, and `--prune` is the only way platform secrets get deleted. `--scope` accepts several scopes, such as `client,shared`.

  The secret export endpoints accept an optional `scopes` array and `push` metadata. Push exports record a new `secrets.pushed` audit log action with the target, destination, and count (never values), shown in the dashboard activity feed.

- aac60a8: Add `relic shell` to open an interactive subshell with decrypted secrets in its environment, so local commands like `bun run dev` work without a `relic run` prefix or a `.env` file. It accepts the same `-e`, `-f`, `-s`, `-p`, and `--inherit-env` flags as `relic run`, reuses its session, service token, and API key auth plus the local cache, and starts `$SHELL` (falling back to `/bin/sh`, or `%COMSPEC%` on Windows) through the Rust runner so values are never written to disk. The shell sets `RELIC_SHELL=1`, `RELIC_ENVIRONMENT`, and, when known, `RELIC_PROJECT_ID`, `RELIC_FOLDER`, and `RELIC_SCOPE` for prompt integration, refuses to nest unless `--force` is passed, and forwards the shell's exit code.
- aac60a8: Add secret rotation tracking. Each secret now records when its value last changed (renames, moves, scope changes, and project key rotation don't reset it), and rotation policies can be set per environment or per secret, with the secret policy taking precedence. New `relic rotation status`, `relic rotation set`, and `relic rotation clear` commands report ages and statuses, and `--fail-on-overdue` fails CI when a secret is overdue, using either a session or `RELIC_SERVICE_TOKEN`. The TUI shows value age and due or overdue markers next to secrets, and `r` sets a policy from the secret or environment view. The web dashboard lists overdue and due-soon secrets, and an opt-in weekly email digest lists overdue secrets. Only names, timestamps, and policies are used; values are never decrypted. Existing secrets are backfilled with `rotation:_backfillValueChangedAt`.
- aac60a8: Add secret history and rollback. Updates and deletes (single and bulk) now keep the previous encrypted value, and deleted secrets can be restored. Retention keeps the last 10 versions per secret on Free and 50 on Pro, based on the project owner's plan. New `relic history` and `relic rollback` commands, and a TUI history view (`t`) with restore. Restores are logged as `secret.restored`. Key rotation re-encrypts history on the owner's device, and the server purges any history left on the old key.
- aac60a8: Add `relic secrets -e <env>` to list secret names and scopes in an environment (never values), and `--json` output for `relic secrets` and `relic projects` (plus `relic projects --project <id>`). JSON errors are printed as `{"error": {"code", "message"}}` with exit code 1, so editors and scripts can tell "not logged in" from other failures.
- 19a539d: Add beta support for Windows. `relic run` now starts commands on Windows with a cleared environment and an allowlist of system variables, finds `.cmd` and `.bat` shims such as `npm.cmd` through `PATHEXT`, stays alive through Ctrl+C to report the command's exit code, and loads the runner and TUI libraries correctly from the standalone `relic.exe`. Config lives in `%APPDATA%\relic`, the password file fallback is restricted to the current user on every platform, and `relic upgrade` detects the binary that is actually running (including Scoop and install-script installs) and explains how to upgrade when Windows locks `relic.exe`. A PowerShell installer is available at `irm https://withrelic.com/install.ps1 | iex`.

### Patch Changes

- 19a539d: `relic run` now shows the backend's error message, such as "Environment not found", instead of the generic "Server Error". When the environment is missing, it also explains how to create it or pick an existing one.

## 0.9.4

### Patch Changes

- Fix `relic upgrade` upgrading the wrong copy when multiple global installs exist (npm vs bun). Detect install method from the running binary and warn when PATH has duplicates.

## 0.9.3

### Patch Changes

- Use withrelic.com for docs links, install URLs, and production fallbacks.

## 0.9.2

### Patch Changes

- 0d14cec: Isolate dev and production data paths: when DEV=true, all config/session/password/cache files use ~/.config/relic-dev/ and keychain service uses com.relic.tui.dev
- 0d14cec: Fix editor not deleting secrets that were removed before saving

## 0.9.1

### Patch Changes

- ace257c: Isolate dev and production data paths: when DEV=true, all config/session/password/cache files use ~/.config/relic-dev/ and keychain service uses com.relic.tui.dev

## 0.9.0

### Minor Changes

- 1ff1b4c: Add `relic version` and `relic upgrade` commands, redesign CLI help output, and show version/plan in TUI status bar

## 0.8.0

### Minor Changes

- Add machine identity with service accounts and OIDC trust policies.
  - **Service accounts** for passwordless CI/CD — single `RELIC_SERVICE_TOKEN` replaces `RELIC_API_KEY` + `RELIC_PASSWORD`
  - **OIDC trust policies** for GitHub Actions and GitLab CI — verify CI platform identity with `--github org/repo` or `--gitlab group/project`
  - **Dashboard management** — list, revoke service accounts, and configure OIDC policies from the web
  - **CLI commands** — `relic service-account create`, `list`, `revoke`
  - **MCP server** — service token support and tool annotations (`readOnlyHint`, `destructiveHint`)
  - **HKDF-SHA256** key derivation for service account tokens (no master password needed)
  - API key + master password in CI is now deprecated — use service accounts instead

## 0.7.0

### Minor Changes

- 08bf115: Add built-in MCP server for AI assistants. Run `relic mcp` to start a stdio-based Model Context Protocol server that integrates with Cursor, Claude Code, Codex, Zed, OpenCode, and Claude Desktop.

  Available tools:
  - `whoami` — show the authenticated user
  - `list-projects` — list all projects with environments and folders
  - `list-secrets` — list secret key names, scopes, and types (never values)
  - `get-current-project` — read project config from relic.toml
  - `run-with-secrets` — run a command with secrets injected as environment variables

  Secret values are never exposed to the AI. The server inherits Relic's client-side encryption model — `list-secrets` returns names only, and `run-with-secrets` returns command output only.

## 0.6.7

### Patch Changes

- Skip redundant keychain write to eliminate second macOS password prompt

## 0.6.6

### Patch Changes

- Fix TUI stdin Buffer crash, cache keychain password to avoid repeated macOS prompts, and resolve web migration issues

## 0.6.5

### Patch Changes

- Fix TUI crash in compiled binary caused by Buffer stdin data and Windows release packaging

## 0.6.4

### Patch Changes

- Enable TUI in compiled binary by patching OpenTUI native lib resolution and bundling libopentui alongside the binary

## 0.6.3

### Patch Changes

- Fix CLI binary compilation to bundle TUI and resolve argon2 native module error

## 0.6.2

### Patch Changes

- Replace native argon2 with hash-wasm (pure WASM) to fix compiled binary crashes. Same argon2id algorithm, identical output.

## 0.6.1

### Patch Changes

- Fix argon2 native addon crash by building standalone binaries on native platform runners instead of cross-compiling from Linux.

## 0.6.0

### Minor Changes

- 3b40735: Distribute compiled binaries via npm using platform-specific optional dependencies. Users can now install with `npm install -g relic` without needing Bun.

## 0.5.0

### Minor Changes

- d6fe498: Distribute compiled binaries via npm using platform-specific optional dependencies. Users can now install with `npm install -g relic` without needing Bun.

### Patch Changes

- 5b43d8f: Fix TUI onboarding by checking the stored master password against the authenticated account before entering the home screen, and route missing-key accounts back through password setup.

## 0.4.4

### Patch Changes

- 30a83d0: Fix TUI onboarding by checking the stored master password against the authenticated account before entering the home screen, and route missing-key accounts back through password setup.
- 3fdbaf3: Update Relic pricing copy in the CLI/TUI to match the lower Pro plan and add-on costs.

## 0.4.3

### Patch Changes

- ca35e4f: Fix the bare CLI launch path by loading the TUI reliably in source runs and waiting for the async command action to finish.

## 0.4.2

### Patch Changes

- 4adddb3: Fix the published CLI runtime by bundling the TUI correctly, preserving async imports in the bundle, and normalizing bad localhost device auth URLs.

## 0.4.1

### Patch Changes

- ec58413: Fix npm publish by bundling workspace dependencies with bun build

## 0.4.0

### Minor Changes

- [#37](https://github.com/heycupola/relic/pull/37) [`3bc478e`](https://github.com/heycupola/relic/commit/3bc478e4cca4875bb0f1189922dff7a5de69c1f1) Thanks [@icanvardar](https://github.com/icanvardar)! - ### Initial Public Release
  - Zero-knowledge secret management with end-to-end encryption
  - `relic run` — inject secrets as environment variables into any command
  - `relic init` — initialize Relic for a project
  - `relic login` / `relic logout` — device authentication flow
  - `relic projects` — list and manage projects
  - `relic whoami` — show current authenticated user
  - Interactive TUI for browsing and managing secrets
  - Scoped secrets support (client, server, shared) with folder organization
  - API key support for CI/CD pipelines
  - Cross-platform: macOS (ARM/x64), Linux (x64), Windows (x64)
  - Available via npm, Homebrew, and standalone binaries
