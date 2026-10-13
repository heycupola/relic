# @repo/logger

## 0.0.2

### Patch Changes

- eb07261: Tidy the TUI shortcut hints. The guide bar drops the `[key]` brackets, lays shortcuts out in evenly sized rows, and no longer lists the obvious `enter` action. Confirmation prompts (delete, archive, restore) now show their `y`/`n` choices in the guide bar instead of inline, secondary hints and dim labels are easier to read, and the password setup status uses the shared task bar. In development, log output now goes through `console` so the TUI captures it instead of drawing over the screen.

## 0.0.1

### Patch Changes

- 19a539d: Add beta support for Windows. `relic run` now starts commands on Windows with a cleared environment and an allowlist of system variables, finds `.cmd` and `.bat` shims such as `npm.cmd` through `PATHEXT`, stays alive through Ctrl+C to report the command's exit code, and loads the runner and TUI libraries correctly from the standalone `relic.exe`. Config lives in `%APPDATA%\relic`, the password file fallback is restricted to the current user on every platform, and `relic upgrade` detects the binary that is actually running (including Scoop and install-script installs) and explains how to upgrade when Windows locks `relic.exe`. A PowerShell installer is available at `irm https://withrelic.com/install.ps1 | iex`.
