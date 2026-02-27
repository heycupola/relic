# @repo/auth

Authentication and session management for Relic.

## Features

- Device code OAuth flow
- Session management (file-based)
- Password storage (keychain + file + environment variable)
- JWT token handling with refresh

## CI/CD Mode

For CI/CD environments, use API keys instead of interactive login:

| Variable | Description |
|----------|-------------|
| `RELIC_API_KEY` | API key created via `relic api-keys create` |
| `RELIC_PASSWORD` | Master password for secret decryption |
| `RELIC_PROJECT_ID` | Project ID (or use `--project` flag or `relic.toml`) |

### RELIC_PASSWORD

Plaintext master password for secret decryption.

## Usage

```typescript
import { 
  loadSession, 
  getPasswordFromStorage,
  isPasswordFromEnv 
} from "@repo/auth";

const session = await loadSession();

const password = await getPasswordFromStorage();
```

## Storage Locations

| Platform | Location |
|----------|----------|
| macOS | `~/.config/relic/` |
| Linux | `~/.config/relic/` |
| Windows | `%APPDATA%/relic/` |

Files stored:
- `session.json` - Session data
- `password` - Master password (fallback when keychain unavailable)

## Priority Order

### Password
1. `RELIC_PASSWORD` environment variable
2. System keychain (macOS/Windows)
3. `~/.config/relic/password`
