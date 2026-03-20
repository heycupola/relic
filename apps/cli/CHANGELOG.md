# @repo/cli

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
