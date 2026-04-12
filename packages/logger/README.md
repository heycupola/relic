# @repo/logger

Shared logging and telemetry for Relic. Provides tagged loggers with file output and opt-in PostHog analytics. Used by both the CLI and TUI.

## Usage

```typescript
import { initLogger, createLogger, trackEvent, trackError } from "@repo/logger";

await initLogger();

const log = createLogger("cli");
log.info("Starting up");
log.debug("Detailed info");

trackEvent("cli_run_started", { environment: "production" });
trackError("cli", error, { action: "decrypt_secret" });
```

## Exports

### Core

| Export | Description |
|--------|-------------|
| `initLogger()` | One-time setup: loads config, sets up transports, registers shutdown hook |
| `createLogger(tag)` | Returns a tagged Consola logger instance |

### Telemetry

| Export | Description |
|--------|-------------|
| `trackEvent(event, properties?)` | Send event to PostHog and log it |
| `trackError(source, error, context?)` | Send `error_occurred` event with message and stack |
| `flushTelemetry()` | Flush and shut down PostHog client |

### Telemetry Preferences

| Export | Description |
|--------|-------------|
| `saveTelemetryPreference(enabled)` | Write preference to `telemetry.json` |
| `getTelemetryPreference()` | Read stored preference (`null` on first run) |
| `isFirstRun()` | `true` when no telemetry preference file exists |

### Paths

| Export | Description |
|--------|-------------|
| `getConfigDir()` | Config directory (`~/.config/relic/`, or `~/.config/relic-dev/` in dev mode) |
| `getLogsDir()` | Logs directory (`~/.config/relic/logs/`, or `~/.config/relic-dev/logs/` in dev mode) |

## Logging

Built on [Consola](https://github.com/unjs/consola).

- **Dev mode** (`DEV=true`): console output + file transport, default level `info`
- **Production**: file transport only, default level `warn`
- **CI**: file transport only, telemetry disabled

### Log Files

| Mode | File |
|------|------|
| Dev | `~/.config/relic-dev/logs/debug.log` |
| Prod | `~/.config/relic/logs/relic.log` |

Override with `RELIC_LOG_FILE`.

Log format: `[ISO timestamp] [LEVEL] [tag] message`

## Telemetry

Opt-in analytics via PostHog, routed through a telemetry proxy.

Telemetry is enabled when all conditions are met:

- `RELIC_TELEMETRY` is not `"false"`
- Not in CI
- Not in dev mode
- Stored preference is `true` (defaults to `true` on first run)

Each event includes `platform`, `arch`, and `node_version` as properties.

Preference is stored in `~/.config/relic/telemetry.json` (or `~/.config/relic-dev/telemetry.json` in dev mode).

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `RELIC_LOG` | Log level (`debug`, `info`, `warn`, `error`, `off`) | Dev: `info`, Prod: `warn` |
| `RELIC_LOG_FILE` | Log file path | See log files table |
| `RELIC_TELEMETRY` | Set to `"false"` to disable | Enabled |
| `RELIC_POSTHOG_KEY` | PostHog API key | Empty (disables telemetry) |
| `RELIC_TELEMETRY_URL` | PostHog proxy host | `https://telemetry.relic.so` |
| `DEV` | Dev mode | `"true"` enables |
| `CI` | CI mode | Disables telemetry and console output |

## Development

```bash
bun test
bun run log:watch    # Tail the log file
```
