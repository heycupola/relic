# @repo/auth

Authentication and session management for Relic.

## Features

- Device code OAuth flow
- Session management (file + environment variable)
- Password storage (keychain + file + environment variable)
- JWT token handling with refresh

## CI/CD Mode

The package automatically detects CI/CD environments via environment variables:

### RELIC_SESSION

Base64-encoded JSON containing session data:

```typescript
interface Session {
  sessionToken: string;
  tokenType: string;
  expiresAt: number;
  jwtToken?: string;
  jwtExpiresAt?: number;
}
```

Generate with:
```bash
cat ~/.config/relic/session.json | base64
```

### RELIC_PASSWORD

Plaintext master password for secret decryption.

## Usage

```typescript
import { 
  loadSession, 
  isSessionFromEnv,
  getPasswordFromStorage,
  isPasswordFromEnv 
} from "@repo/auth";

// Automatically uses env var or file
const session = await loadSession();

// Check if running in CI mode
if (isSessionFromEnv()) {
  console.log("Running in CI/CD mode");
}

// Get password (env var or storage)
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

### Session
1. `RELIC_SESSION` environment variable
2. `~/.config/relic/session.json`

### Password
1. `RELIC_PASSWORD` environment variable
2. System keychain (macOS/Windows)
3. `~/.config/relic/password`
