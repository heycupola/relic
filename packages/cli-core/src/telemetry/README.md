# Relic CLI - Telemetry

## Setup

```rust
let reporter = SentryReporter::new("https://telemetry.relic.so");
initialize_logging(Some(reporter.clone()))?;
setup_panic_handler(reporter);
```

## Usage

```rust
tracing::info!("User {} logged in", user_id);
tracing::warn!("Retry attempt {}/3", attempt);
tracing::error!("Payment failed: {}", err);
```

## Development vs Production

| | Development (`cargo build`) | Production (`cargo build --release`) |
|---|---|---|
| **File logging** | All levels → `relic.log` | All levels → `relic.log` |
| **Sentry HTTP** | Disabled | `error!` and `warn!` sent to Sentry |
| **Breadcrumbs** | None | `info!`/`debug!` stored, attached to next error |

**Why?** In dev you just read the log file. In prod, errors are sent remotely so you can monitor crashes without access to the user's machine.

## Panic Handler

Catches unrecoverable crashes (`panic!`) and reports them to Sentry before the program exits.

**What it captures:**
- Panic message
- File, line, column where it happened
- Thread ID

**Example:** If your code does `panic!("database connection lost")`, Sentry receives:
```json
{
  "message": "Panic: database connection lost",
  "context": { "location": "src/db.rs:42:5" },
  "level": "error"
}
```

Without this, panics would crash silently with no remote visibility.

## Log File

`~/.local/share/relic-tui/relic.log`

Override: `RELIC_DATA=/custom/path`
