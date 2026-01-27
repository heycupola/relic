# Relic

Zero-knowledge secret management for your projects. Secrets are fetched at runtime and injected as environment variables - never written to disk.

## Quick Start

```bash
# Install globally
npm install -g @relic/cli

# Authenticate
relic login

# Initialize in your project
relic init

# Run with secrets
relic run -e development npm start
```

## CLI Commands

```bash
relic login                          # Authenticate via browser
relic logout                         # Clear authentication
relic init                           # Initialize project (creates relic.json)
relic run -e <env> <command>         # Run command with secrets injected
relic whoami                         # Show current user
relic status                         # Show project and auth state
```

## Configuration

### Simple Project

Create `relic.json` in your project root:

```json
{
  "project": "my-app"
}
```

### Monorepo

For monorepos, define workspace-to-folder mappings:

```json
{
  "project": "my-turborepo",
  "workspaces": {
    "apps/api": { "folder": "api" },
    "apps/web": { "folder": "web" }
  }
}
```

## Environment and Folder Syntax

Relic uses the `environment:folder` syntax to specify which secrets to inject:

```bash
# Just environment (root secrets only)
relic run -e development npm start

# Environment + folder
relic run -e production:api npm start
```

### How Folders Work

Secrets are organized in environments with optional folders:

```
Environment: production
├── (root)          # Shared secrets - always injected
│   ├── APP_NAME
│   └── LOG_LEVEL
├── api/            # Only with :api
│   ├── DATABASE_URL
│   └── REDIS_URL
└── web/            # Only with :web
    └── NEXT_PUBLIC_API_URL
```

When you run `relic run -e production:api npm start`:
- Root secrets are injected (APP_NAME, LOG_LEVEL)
- `api/` folder secrets are merged on top (DATABASE_URL, REDIS_URL)

## Monorepo Auto-Detection

In a configured monorepo, Relic automatically detects the folder based on your current directory:

```bash
cd apps/api
relic run -e development npm start
# Automatically uses "api" folder based on workspace config
```

The CLI walks up directories to find `relic.json`, then matches your current path against the `workspaces` config.

## Environment Variables

For CI/CD or scripting, use environment variables instead of flags:

```bash
RELIC_ENV=production relic run npm start
RELIC_ENV=production:api relic run npm start
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    TypeScript CLI                        │
│  1. Validate session                                     │
│  2. Find relic.json (walk up directories)               │
│  3. Fetch secrets from Convex                           │
│  4. Call Rust runner via FFI                            │
└─────────────────────────────┬───────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────┐
│                     Rust Runner                          │
│  1. Receive command + secrets as JSON                   │
│  2. Inject secrets as environment variables             │
│  3. Spawn process                                       │
│  4. Return exit code                                    │
└─────────────────────────────────────────────────────────┘
```

## Development

```bash
# Install dependencies
bun install

# Build the Rust runner
cd packages/runner && cargo build

# Run CLI in development
cd apps/cli && bun run dev
```

## Packages

| Package | Description |
|---------|-------------|
| `apps/cli` | CLI application (TypeScript + Ink) |
| `apps/web` | Web dashboard |
| `apps/tui` | Terminal UI for secret management |
| `packages/runner` | Rust library for secure process spawning |
| `packages/auth` | Shared authentication logic |
| `packages/backend` | Convex backend |

## License

MIT
