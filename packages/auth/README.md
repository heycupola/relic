# @repo/auth

Authentication and session management for Relic. Handles device code OAuth, JWT tokens, password storage, and session persistence.

## Exports

### Device Auth

| Export | Description |
|--------|-------------|
| `deviceAuth` | Device code OAuth service (`requestDeviceCode`, `pollForToken`, `startAuth`, `stopPolling`) |
| `publicApi` | Convex HTTP client for device auth endpoints |

### Session

| Export | Description |
|--------|-------------|
| `loadSession()` | Read session from file |
| `saveSession(session)` | Write session to file |
| `clearSession()` | Delete session file |
| `validateSession()` | Returns `{ isValid, isExpired, session }` |
| `hasValidSession()` | Boolean check |
| `getSessionToken()` | Session token string |
| `getJwtToken()` | JWT string (cached or refreshed) |
| `updateSessionJwt(jwt, expiresAt)` | Update JWT in session file |
| `watchSession(callback)` | Watch session file for changes (`created`, `deleted`, `changed`) |

### JWT

| Export | Description |
|--------|-------------|
| `ensureValidJwt()` | Return valid JWT or throw `InvalidJwtError` |
| `fetchJwtToken(sessionToken)` | Fetch JWT from auth endpoint |
| `getOrRefreshJwtToken()` | Use cached JWT or refresh |
| `setJwtLogger(logger)` | Set logger for JWT operations |

### Password

| Export | Description |
|--------|-------------|
| `getPasswordFromStorage()` | Read password (env > keychain > file) |
| `savePassword(password)` | Save to keychain, fallback to file |
| `clearPassword()` | Remove from keychain and file |
| `hasPassword()` | Check if password exists |
| `isPasswordFromEnv()` | Whether `RELIC_PASSWORD` is set |
| `verifyPassword(password)` | Compare with stored password |
| `verifyPasswordWithExistingKeys(password, keys)` | Decrypt private key to verify |
| `validatePassword(password)` | Validation result |
| `checkPasswordRequirements(password)` | Requirement checklist |

### User Key Cache

| Export | Description |
|--------|-------------|
| `getUserKeyCacheDb()` | SQLite database instance |
| `getCachedUserKeys()` | Read cached keys |
| `cacheUserKeys(keys)` | Write keys to cache |
| `clearCachedUserKeys()` | Clear cached keys |

### Errors

| Export | Description |
|--------|-------------|
| `AuthenticationError` | Base auth error |
| `SessionExpiredError` | Session expired |
| `InvalidJwtError` | No valid JWT |

### Helpers

| Export | Description |
|--------|-------------|
| `isConvexError()` | Check if error is a Convex error |
| `extractErrorMessage()` | Extract message from error |
| `isAuthorizationPending()` | Check for pending device auth |
| `isAuthorizationDenied()` | Check for denied device auth |
| `isDeviceCodeExpired()` | Check for expired device code |

## Device Code Flow

1. `publicApi.requestDeviceCode()` returns `{ device_code, user_code, verification_uri_complete }`
2. Browser opens `verification_uri_complete`
3. `deviceAuth.pollForToken(device_code)` polls at the configured interval
4. On approval, session is saved to `~/.config/relic/session.json`

## Password Priority

1. `RELIC_PASSWORD` environment variable
2. System keychain (`com.relic.tui`)
3. `~/.config/relic/password` file

## Storage

| File | Location | Format |
|------|----------|--------|
| `session.json` | `~/.config/relic/` | JSON (`sessionToken`, `tokenType`, `expiresAt`, `jwtToken?`, `jwtExpiresAt?`) |
| `password` | `~/.config/relic/` | Plaintext |
| `relic.db` | `~/.config/relic/` | SQLite with `user_keys` table |

On Windows, `~/.config/relic/` is replaced with `%APPDATA%/relic/`.

## Development

```bash
bun test
```
