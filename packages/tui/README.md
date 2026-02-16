# @repo/tui

Terminal UI application for Relic built with React and Bun. Provides an interactive command-line interface for managing secrets and projects.

## Usage

```bash
bun start
```

## Caching

The TUI shares a local SQLite cache with the CLI, stored at `~/.config/relic/relic.db`. When a user manages secrets through the TUI (create, update, delete), the backend bumps `updatedAt` on the affected environment/folder. This ensures the CLI's cache is invalidated on the next `relic run` and fresh data is fetched.

User encryption keys (encrypted private key and salt) are cached separately in a user key database. These are cleared on explicit logout but persist across session expiry so the user doesn't need to re-enter their password after re-authenticating.

## Development

```bash
bun start        # Start with hot reload
bun run debug    # Start with debug logging
```
