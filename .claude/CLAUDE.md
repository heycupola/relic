# Relic Monorepo - Claude Context

Zero-knowledge secret management platform organized as a Turborepo monorepo using Bun.

## Structure

### Apps
- [cli](file:///Users/icanvardar/Documents/relic/.claude/apps/cli.md): FFI bridge to Rust-based core CLI.
- `web`: Next.js web application.

### Packages
- [tui](file:///Users/icanvardar/Documents/relic/.claude/packages/tui.md): Terminal UI (OpenTUI React).
- [backend](file:///Users/icanvardar/Documents/relic/.claude/packages/backend.md): Convex backend (Zero-knowledge blobs).
- `ui`: Shared React components.

## Critical Principles
1. **Zero-Knowledge**: Plaintext secrets MUST NEVER reach the backend. Encryption is client-side.
2. **Bun First**: Use `bun` for install, run, test, and build. No `npm/yarn/pnpm`.
3. **No Emojis**: Do not use emojis in code, comments, or commits.
4. **Strict TypeScript**: Avoid `any`.

## Guides
- [Biome](file:///Users/icanvardar/Documents/relic/.claude/guides/biome.md): Linting/formatting.
- [Conventions](file:///Users/icanvardar/Documents/relic/.claude/guides/conventions.md): UI/UX patterns and keybindings.

## Commands
- `bun install`: Install.
- `turbo build`: Build all.
- `turbo dev`: Dev mode.
- `turbo test`: Run tests.
