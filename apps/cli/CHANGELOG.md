# @repo/cli

## 0.9.3

### Patch Changes

- 9c05d01: Isolate dev and production data paths: when DEV=true, all config/session/password/cache files use ~/.config/relic-dev/ and keychain service uses com.relic.tui.dev
- 9c05d01: Fix editor not deleting secrets that were removed before saving

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
