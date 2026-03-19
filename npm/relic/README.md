# Relic

Zero-knowledge secret layer for your projects. Encrypted on your device, never exposed to anyone else. Not even us.

## Installation

```bash
# npm
npm install -g relic

# Homebrew
brew install heycupola/tap/relic

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
| `relic telemetry` | Manage anonymous usage data collection |

### `relic run` options

| Flag | Description |
|------|-------------|
| `-e, --environment` | Environment name (required) |
| `-f, --folder` | Folder name |
| `-s, --scope` | `client`, `server`, or `shared` |
| `-p, --project` | Project ID (overrides `relic.toml`) |

## CI/CD

Use API keys for non-interactive environments:

```yaml
# GitHub Actions
- name: Deploy with secrets
  env:
    RELIC_API_KEY: ${{ secrets.RELIC_API_KEY }}
    RELIC_PASSWORD: ${{ secrets.RELIC_PASSWORD }}
  run: npx relic run -e production -- npm run deploy
```

| Variable | Description |
|----------|-------------|
| `RELIC_API_KEY` | API key for authentication |
| `RELIC_PASSWORD` | Master password for decryption |
| `RELIC_PROJECT_ID` | Project ID (optional if `relic.toml` exists) |

## Supported Platforms

| Platform | Architecture |
|----------|-------------|
| macOS | ARM64 (Apple Silicon) |
| macOS | x64 (Intel) |
| Linux | x64 |
| Windows | x64 |

## Links

- [Website](https://heyrelic.com)
- [Documentation](https://docs.heyrelic.com)
- [GitHub](https://github.com/heycupola/relic)
