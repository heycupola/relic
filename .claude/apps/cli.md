# Relic CLI - Context

The Relic CLI is a TypeScript-based CLI that uses a minimal Rust runner for secure secret injection via FFI.

## Tech Stack
- **TypeScript/Bun**: Main CLI logic, authentication, secret fetching, and decryption.
- **Ink/React**: Terminal UI components for interactive flows.
- **Rust (runner)**: Minimal FFI library for spawning processes with injected environment variables.

## Structure
- `index.ts`: Entry point using Commander.js for CLI commands.
- `commands/`: Individual command implementations (login, run, init, etc.).
- `lib/`: Shared utilities (api, config, crypto).
- `ffi/bridge.ts`: `RunnerBridge` class managing the Rust FFI interface.
- `packages/runner/`: Rust source code for the secret injection runner.

## Key Commands
- `bun run build:runner`: Build the Rust runner (`cargo build`).
- `bun run dev`: Rebuild the Rust runner and run `index.ts`.
- `bun run logs`: Tail the local application logs.

## CLI Commands
- `relic login`: Authenticate with device flow.
- `relic logout`: Clear session.
- `relic whoami`: Show current user.
- `relic projects`: List projects.
- `relic init`: Initialize project config.
- `relic run -e <env> [command]`: Run command with secrets injected.
- `relic export-session`: Export session for CI/CD.

## Development Note
The CLI logic is in TypeScript (`apps/cli/`). The Rust runner (`packages/runner/`) only handles spawning the child process with environment variables - all authentication, API calls, and decryption happen in TypeScript.
