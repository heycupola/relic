# @repo/logger

## 0.0.1

### Patch Changes

- 19a539d: Add beta support for Windows. `relic run` now starts commands on Windows with a cleared environment and an allowlist of system variables, finds `.cmd` and `.bat` shims such as `npm.cmd` through `PATHEXT`, stays alive through Ctrl+C to report the command's exit code, and loads the runner and TUI libraries correctly from the standalone `relic.exe`. Config lives in `%APPDATA%\relic`, the password file fallback is restricted to the current user on every platform, and `relic upgrade` detects the binary that is actually running (including Scoop and install-script installs) and explains how to upgrade when Windows locks `relic.exe`. A PowerShell installer is available at `irm https://withrelic.com/install.ps1 | iex`.
