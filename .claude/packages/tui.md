# Relic TUI - Context

Terminal User Interface for Relic using OpenTUI React.

## Tech Stack
- **Bun**: Runtime and package manager.
- **OpenTUI React**: React-based terminal renderer.
- **Convex**: Backend integration (via `@repo/backend`).

## Critical Architecture
- **Zero-Knowledge**: All encryption/decryption happens in the TUI. Backend only sees encrypted blobs.
- **RSA Keys**: User's private key is decrypted locally with their master password.

## Directory Structure
- `components/`: Organized by feature (`auth`, `projects`, `secrets`, `pages`, `shared`).
- `hooks/`: `useAuth`, `useEncryption`, `useConvex`.
- `lib/`: `crypto.ts` (WebCrypto RSA/AES), `convex.ts` (client setup).
- `utils/`: UI and terminal helpers.

## Essential Hooks (OpenTUI)
- `useKeyboard(handler)`: Primary input handler.
- `useTerminalDimensions()`: Responsive layout info.

## Development Rules
- Use `render_diffs` or `view_file` to understand component state.
- Design for keyboard navigation (Tab, Escape, Arrows).
- Never log plaintext secrets or unencrypted private keys.
