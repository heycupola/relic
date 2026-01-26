# Relic CLI - Context

The Relic CLI is a wrapper that bridges JavaScript (Bun) to a Rust-based core via FFI.

## Tech Stack
- **Bun FFI**: Bridges to the Rust library.
- **Rust (cli-core/core)**: Handles core logic and encryption (via Cargo).

## Structure
- `index.ts`: Entry point, passes CLI args to the bridge.
- `ffi/bridge.ts`: `Bridge` class managing the FFI interface.
- `packages/cli-core/`: Rust source code for the CLI core.

## Key Commands
- `bun run build:bindings`: Build the Rust core (`cargo build`).
- `bun run dev`: Rebuild the Rust core and run `index.ts`.
- `bun run logs`: Tail the local application logs.

## Development Note
The CLI logic is primarily in Rust (`packages/cli-core/`). The TypeScript side handles the bridge and initial argument passing.
