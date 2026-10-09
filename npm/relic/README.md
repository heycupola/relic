# Relic

Zero-knowledge secret layer for your projects. Encrypted on your device, never exposed to anyone else. Not even us.

## Installation

```bash
# npm
npm install -g relic

# Homebrew
brew install heycupola/tap/relic

# Install script (installs to ~/.relic/bin)
curl -fsSL https://withrelic.com/install | bash

# Download binary
curl -fsSL https://github.com/heycupola/relic/releases/latest/download/relic-$(uname -s | tr '[:upper:]' '[:lower:]')-$(uname -m).tar.gz | tar -xz -C /usr/local/bin
```

## Usage

```bash
# Launch the TUI
relic

# Authenticate
relic login

# Initialize a project
relic init

# Run a command with secrets injected
relic run -e production -- npm run deploy
relic run -e staging -f database -- ./migrate.sh
relic run -e production -s client -- npm run build

# Open a subshell with secrets loaded (type `exit` to leave)
relic shell -e development
```

## Commands

| Command | Description |
|---------|-------------|
| `relic` | Launch the TUI (default) |
| `relic login` | Authenticate via device code flow |
| `relic logout` | Clear session and cached data |
| `relic whoami` | Show current user |
| `relic projects` | List projects with environments and folders |
| `relic init` | Create `relic.toml` for the current project |
| `relic run` | Run a command with secrets injected |
| `relic shell` | Open a subshell with secrets loaded |
| `relic service-account` | Create, list, and revoke service accounts for CI/CD |
| `relic mcp` | Start the MCP server for AI assistants |
| `relic upgrade` | Upgrade to the latest version |
| `relic version` | Print the installed version |
| `relic telemetry` | Manage anonymous usage data collection |

### `relic run` options

| Flag | Description |
|------|-------------|
| `-e, --environment` | Environment name (required) |
| `-f, --folder` | Folder name |
| `-s, --scope` | `client`, `server`, or `shared` |
| `-p, --project` | Project ID (overrides `RELIC_PROJECT_ID` and `relic.toml`) |
| `--inherit-env` | Pass the current environment (minus `RELIC_*`) to the command |

By default the command only receives the secrets plus `PATH`, `HOME`, `USER`, `SHELL`, `TERM`, `LANG`, `LC_ALL`, `LC_CTYPE`, `TMPDIR`, and `TZ`. Options after the command name are passed to the command; use `--` to separate them explicitly.

`relic shell` accepts the same options, plus `--force` to open a nested shell.

## CI/CD

Use a service account (recommended):

```bash
relic service-account create --name "ci-deploy" --github myorg/myrepo --branch main
```

```yaml
# GitHub Actions
- name: Deploy with secrets
  env:
    RELIC_SERVICE_TOKEN: ${{ secrets.RELIC_SERVICE_TOKEN }}
  run: npx relic run -e production -- npm run deploy
```

| Variable | Description |
|----------|-------------|
| `RELIC_SERVICE_TOKEN` | Service account token (authentication and decryption) |
| `RELIC_OIDC_TOKEN` | OIDC token; requested automatically in GitHub Actions, set via `id_tokens` in GitLab CI |

`RELIC_API_KEY` + `RELIC_PASSWORD` still work but are deprecated because they put your master password in CI.

## Supported Platforms

| Platform | Architecture |
|----------|-------------|
| macOS | ARM64 (Apple Silicon) |
| macOS | x64 (Intel) |
| Linux | x64 |
| Windows | x64 |

## Links

- [Website](https://withrelic.com)
- [Documentation](https://docs.withrelic.com)
- [GitHub](https://github.com/heycupola/relic)
