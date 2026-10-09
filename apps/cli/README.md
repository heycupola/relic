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
| `relic shell`                  | Open a subshell with secrets loaded                             |
| `relic import`                 | Import secrets from a file or provider                          |
| `relic push`                   | Sync secrets to a deploy platform                               |
| `relic check`                  | Check required keys exist (names only)                          |
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

### `relic shell`

```bash
relic shell -e <environment> [options]
```

Accepts the same flags as `relic run`, plus `--force` to open a nested shell. Starts `$SHELL` through the runner with the secrets and `RELIC_SHELL`, `RELIC_ENVIRONMENT`, `RELIC_PROJECT_ID`, `RELIC_FOLDER`, `RELIC_SCOPE` markers. Refuses to nest when `RELIC_SHELL=1` unless `--force` is passed.

```bash
relic shell -e development
```

### `relic import`

```bash
relic import [source] -e <environment> [options]
```

`source` is a `.env` or `.json` path (default `.env`), `-` for stdin, or `doppler`, `infisical`, `vercel`, `1password`. Values are encrypted locally and uploaded through the same bulk mutation as the TUI editor. The plan lists names only.

| Flag                | Description                                    |
| ------------------- | ---------------------------------------------- |
| `-e, --environment` | Environment name (required)                    |
| `-f, --folder`      | Folder name                                    |
| `-s, --scope`       | Default scope: `client`, `server`, or `shared` |
| `-p, --project`     | Project ID (overrides `relic.toml`)            |
| `--overwrite`       | Replace existing secrets                       |
| `--skip-existing`   | Keep existing secrets                          |
| `--dry-run`         | Print the plan only                            |

```bash
relic import -e development --dry-run
relic import doppler -e production --doppler-project web --doppler-config prd
cat secrets.json | relic import - -e staging --skip-existing
```

See the [importing guide](https://docs.withrelic.com/guides/importing) for all sources and flags.

### `relic push`

```bash
relic push -e <environment> --target <vercel|cloudflare|github|fly> [options]
```

| Flag                | Description                                           |
| ------------------- | ----------------------------------------------------- |
| `-e, --environment` | Environment name (required)                           |
| `-t, --target`      | `vercel`, `cloudflare`, `github`, or `fly` (required) |
| `-f, --folder`      | Folder name                                           |
| `-s, --scope`       | Comma separated: `client`, `server`, `shared`         |
| `-p, --project`     | Project ID (overrides `relic.toml`)                   |
| `--dry-run`         | Print the plan (names only) and exit                  |
| `--prune`           | Delete platform secrets that are not in Relic         |
| `-y, --yes`         | Skip confirmation (required in CI)                    |

Platform adapters live in `lib/push/`. Each implements `PlatformAdapter` (`list`, `upsert`, `delete`, optional `validate`) and is registered in `lib/push/index.ts`. Values are sent to platform APIs in memory or to platform CLIs on stdin, never as arguments or temp files.

```bash
relic push -e production --target vercel --dry-run
relic push -e staging --target cloudflare --wrangler-env staging
relic push -e production --target github --github-env production --yes
```

### `relic check`

```bash
relic check -e <environment> [options]
```

Compares required key names with the secrets in an environment. Never fetches or decrypts values. Required keys come from `.env.example`, `.env.sample`, and `.env.template` next to `relic.toml` (or `--from`), plus `--scan`. Exits `1` when a required key is missing.

| Flag                | Description                                                      |
| ------------------- | ---------------------------------------------------------------- |
| `-e, --environment` | Environment name (required)                                      |
| `-f, --folder`      | Folder name                                                      |
| `-s, --scope`       | `client`, `server`, or `shared`                                  |
| `-p, --project`     | Project ID (overrides `relic.toml`)                              |
| `--from <file>`     | Read required keys from a file instead of the templates (repeat) |
| `--scan [paths...]` | Scan JS/TS/Python sources for env reads                          |
| `--ignore <keys>`   | Keys to skip, comma-separated, `*` wildcards (repeat)            |
| `--compare <env>`   | Show key names that exist in only one environment                |
| `--strict`          | Also fail on unused keys and `--compare` differences             |
| `--json`            | Machine-readable output                                          |

```bash
relic check -e production --scan src
relic check -e staging --compare production
```

## Configuration

`relic.toml` in project root:

```toml
project_id = "<uuid>"

# Optional: keys relic check should skip
[check]
ignore = ["NODE_ENV", "PORT"]
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
│   ├── shell.ts        # relic shell
│   ├── import.ts       # relic import
│   ├── push.ts         # relic push
│   ├── check.ts        # relic check
│   └── telemetry.ts    # relic telemetry
├── lib/
│   ├── api.ts          # Convex API client, secret export
│   ├── check.ts        # relic check report building and output
│   ├── cli.ts          # Shared messages, auth/error helpers
│   ├── config.ts       # relic.toml loading/saving
│   ├── env.ts          # Child environment helpers (RELIC_* stripping)
│   ├── env-keys.ts     # Env template parsing and source scanning
│   ├── telemetry.ts    # Sanitized error tracking, flush-before-exit
│   ├── crypto.ts       # Secret encryption/decryption helpers
│   ├── import-plan.ts  # Import plan, conflict handling, batched upload
│   ├── import-sources.ts # File, stdin, and provider readers for relic import
│   ├── oidc.ts         # CI OIDC token resolution
│   ├── push/           # relic push plan, adapters (vercel, cloudflare, github, fly)
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
