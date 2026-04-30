# Relic CLI

Zero-knowledge secret layer CLI. Fetches encrypted secrets from the server, decrypts them locally, and injects them into the process environment.

## Installation

```bash
bun install
```

## Commands

| Command                   | Description                                 |
| ------------------------- | ------------------------------------------- |
| `relic`                   | Launch the TUI (default)                    |
| `relic login`             | Authenticate via device code flow           |
| `relic logout`            | Clear session, cached keys, and password    |
| `relic whoami`            | Show current user (name, email, plan)       |
| `relic projects`          | List projects with environments and folders |
| `relic init`              | Create `relic.toml` and `.relic/` directory |
| `relic run`               | Run a command with secrets injected         |
| `relic telemetry status`  | Show telemetry status                       |
| `relic telemetry enable`  | Enable telemetry                            |
| `relic telemetry disable` | Disable telemetry                           |

### `relic run`

```bash
relic run -e <environment> [options] -- <command>
```

| Flag                | Description                         |
| ------------------- | ----------------------------------- |
| `-e, --environment` | Environment name (required)         |
| `-f, --folder`      | Folder name                         |
| `-s, --scope`       | `client`, `server`, or `shared`     |
| `-p, --project`     | Project ID (overrides `relic.toml`) |

```bash
relic run -e production -- npm run deploy
relic run -e staging -f database -- ./migrate.sh
relic run -e production -s client -- npm run build
```

## Configuration

`relic.toml` in project root:

```toml
project_id = "<uuid>"
```

Created by `relic init`. The CLI walks up from the current directory to find it.

## Runner (FFI)

Secret injection uses a Rust binary (`packages/runner`) loaded via Bun FFI (`dlopen`). The runner:

- Spawns the child process with a clean environment (`env_clear()`)
- Injects only the decrypted secrets
- Forwards signals (SIGTERM, SIGINT)
- Uses `Zeroizing` for secret memory and disables core dumps

Prebuilt binaries in `prebuilds/` for: `darwin-arm64`, `darwin-x64`, `linux-x64`, `win32-x64`.

## Caching

Local SQLite cache at `.relic/cache.db` (relative to `relic.toml` location). Used in session mode only; API key mode always fetches fresh data.

**Cached data:** environment/folder ID mappings, encrypted secrets, encrypted project key.

**Invalidation:** on each `relic run`, the CLI compares local `lastCachedAt` against the backend `updatedAt`. Stale cache triggers a fresh fetch. Key rotation invalidates all caches.

Scope filtering (`--scope`) is applied locally against cached data.

## CI/CD

Use API keys instead of interactive login:

| Variable           | Description                                  |
| ------------------ | -------------------------------------------- |
| `RELIC_API_KEY`    | API key for authentication                   |
| `RELIC_PASSWORD`   | Master password for decryption               |
| `RELIC_PROJECT_ID` | Project ID (optional if `relic.toml` exists) |
| `CONVEX_SITE_URL`  | Convex HTTP actions URL                      |

### GitHub Actions

```yaml
- name: Deploy with secrets
  env:
    RELIC_API_KEY: ${{ secrets.RELIC_API_KEY }}
    RELIC_PASSWORD: ${{ secrets.RELIC_PASSWORD }}
    RELIC_PROJECT_ID: ${{ secrets.RELIC_PROJECT_ID }}
    CONVEX_URL: ${{ secrets.CONVEX_URL }}
    CONVEX_SITE_URL: ${{ secrets.CONVEX_SITE_URL }}
  run: bunx relic run -e production -- npm run deploy
```

## Structure

```
├── index.ts            # Entry point (commander setup)
├── commands/
│   ├── init.ts         # relic init
│   ├── login.ts        # relic login
│   ├── logout.ts       # relic logout
│   ├── whoami.ts       # relic whoami
│   ├── projects.ts     # relic projects
│   ├── run.ts          # relic run
│   └── telemetry.ts    # relic telemetry
├── lib/
│   ├── api.ts          # Convex API client, secret export
│   ├── config.ts       # relic.toml loading/saving
│   ├── crypto.ts       # Secret decryption helpers
│   └── types.ts        # SecretScope type
├── ffi/
│   ├── bridge.ts       # RunnerBridge FFI wrapper
│   ├── helper.ts       # Library loading (dlopen)
│   └── constants.ts    # URLs
└── helpers/
    └── cache.ts        # SQLite cache
```

## Development

```bash
bun run index.ts
```
