# @repo/cli

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
