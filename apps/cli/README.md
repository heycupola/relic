# Relic CLI

Zero-knowledge secret layer CLI. Fetches encrypted secrets from the server, decrypts them locally, and injects them into the process environment.

## Installation

```bash
bun install
```

## Commands

| Command                        | Description                                                     |
| ------------------------------ | --------------------------------------------------------------- |
| `relic`                        | Launch the TUI (default)                                        |
| `relic login`                  | Authenticate via device code flow                               |
| `relic logout`                 | Clear session, cached keys, and password                        |
| `relic whoami`                 | Show current user (name, email, plan); exits 1 if not logged in |
| `relic projects`               | List projects with environments and folders                     |
| `relic init`                   | Create `relic.toml` and `.relic/` (with its own `.gitignore`)   |
| `relic run`                    | Run a command with secrets injected                             |
| `relic service-account create` | Create a service account (CI/CD token, optional OIDC policy)    |
| `relic service-account list`   | List service accounts for a project                             |
| `relic service-account revoke` | Revoke a service account by `--name` or `--id`                  |
| `relic mcp`                    | Start the MCP server (stdio) for AI assistants                  |
| `relic upgrade`                | Upgrade via Homebrew, npm, Bun, or the `curl` install script    |
| `relic version`                | Print the installed version                                     |
| `relic telemetry status`       | Show telemetry status                                           |
| `relic telemetry enable`       | Enable telemetry                                                |
| `relic telemetry disable`      | Disable telemetry                                               |

### `relic run`

```bash
relic run -e <environment> [options] -- <command>
```

| Flag                | Description                                                   |
| ------------------- | ------------------------------------------------------------- |
| `-e, --environment` | Environment name (required)                                   |
| `-f, --folder`      | Folder name                                                   |
| `-s, --scope`       | `client`, `server`, or `shared`                               |
| `-p, --project`     | Project ID (overrides `RELIC_PROJECT_ID` and `relic.toml`)    |
| `--inherit-env`     | Pass the current environment (minus `RELIC_*`) to the command |

```bash
relic run -e production -- npm run deploy
relic run -e staging -f database -- ./migrate.sh
relic run -e production -s client -- npm run build
relic run -e production --inherit-env -- npm run build
```

- Options after the command name belong to the command (`relic run -e prod node -e "..."` works). Use `--` to make the boundary explicit.
- `relic.toml` is optional when `-p` or `RELIC_PROJECT_ID` is set.
- By default the command only sees the secrets plus `PATH`, `HOME`, `USER`, `SHELL`, `TERM`, `LANG`, `LC_ALL`, `LC_CTYPE`, `TMPDIR`, `TZ`. Use `--inherit-env` for the rest (secrets win on conflicts).
- Exit code: the command's own, `128 + N` if killed by signal `N`, `127` if the command isn't found, `1` for Relic errors.

## Configuration

`relic.toml` in project root:

```toml
project_id = "<uuid>"
```

Created by `relic init`. The CLI walks up from the current directory to find it.

## Runner (FFI)

Secret injection uses a Rust binary (`packages/runner`) loaded via Bun FFI (`dlopen`). The runner:

- Spawns the child process with a clean environment (`env_clear()`), re-adding only a minimal allowlist (`PATH`, `HOME`, `USER`, `SHELL`, `TERM`, `LANG`, `LC_ALL`, `LC_CTYPE`, `TMPDIR`, `TZ`)
- Injects the decrypted secrets (plus the parent environment minus `RELIC_*` when `--inherit-env` is used)
- Forwards signals (SIGTERM, SIGINT)
- Uses `Zeroizing` for secret memory and disables core dumps

Prebuilt binaries in `prebuilds/` for: `darwin-arm64`, `darwin-x64`, `linux-x64`, `win32-x64`.

## Caching

Local SQLite cache at `.relic/cache.db` (relative to `relic.toml` location), or `~/.config/relic/cache/<project-id>.db` when there is no `relic.toml`. Used in session mode only; service token and API key modes always fetch fresh data. `.relic/` gets a `.gitignore` containing `*`.

**Cached data:** environment/folder ID mappings, encrypted secrets, encrypted project key.

**Invalidation:** on each `relic run`, the CLI compares local `lastCachedAt` against the backend `updatedAt`. Stale cache triggers a fresh fetch. Key rotation invalidates all caches.

Scope filtering (`--scope`) is applied locally against cached data.

## CI/CD

Use a **service account** (recommended). Create one, store the token in your CI secret storage, and set it as `RELIC_SERVICE_TOKEN`:

```bash
relic service-account create --name "ci-deploy" --github myorg/myrepo --branch main
```

| Variable              | Description                                                                 |
| --------------------- | --------------------------------------------------------------------------- |
| `RELIC_SERVICE_TOKEN` | Service account token; handles authentication and decryption                |
| `RELIC_OIDC_TOKEN`    | OIDC token (requested automatically in GitHub Actions; GitLab: `id_tokens`) |

### GitHub Actions

```yaml
permissions:
  id-token: write # only needed with an OIDC policy
  contents: read

steps:
  - name: Deploy with secrets
    env:
      RELIC_SERVICE_TOKEN: ${{ secrets.RELIC_SERVICE_TOKEN }}
    run: relic run -e production -- npm run deploy
```

### GitLab CI

```yaml
deploy:
  id_tokens: # only needed with an OIDC policy (--gitlab)
    RELIC_OIDC_TOKEN:
      aud: relic
  script:
    - relic run -e production -- npm run deploy
  variables:
    RELIC_SERVICE_TOKEN: $RELIC_SERVICE_TOKEN
```

### API key + password (deprecated)

`RELIC_API_KEY` + `RELIC_PASSWORD` (+ optional `RELIC_PROJECT_ID`) still work but put your master password into CI. Migrate to service accounts.

### Self-hosted / development

`RELIC_CONVEX_URL`, `RELIC_CONVEX_SITE_URL`, and `RELIC_SITE_URL` override the server URLs. The generic `CONVEX_URL` / `CONVEX_SITE_URL` / `SITE_URL` names are no longer read.

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
│   ├── service-account.ts # relic service-account
│   ├── upgrade.ts      # relic upgrade
│   └── telemetry.ts    # relic telemetry
├── lib/
│   ├── api.ts          # Convex API client, secret export
│   ├── cli.ts          # Shared messages, auth/error helpers
│   ├── config.ts       # relic.toml loading/saving
│   ├── crypto.ts       # Secret decryption helpers
│   ├── env.ts          # Child environment helpers (RELIC_* stripping)
│   ├── telemetry.ts    # Sanitized error tracking, flush-before-exit
│   └── types.ts        # SecretScope type
├── mcp/
│   ├── server.ts       # relic mcp (MCP tools)
│   └── run-command.ts  # run-with-secrets: redaction, timeout, output cap
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
