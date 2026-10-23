# @repo/auth

## 0.0.2

### Patch Changes

- 8fb270d: Ask for keychain access only once when the TUI starts. On macOS, opening the TUI used to show the "relic wants to access key com.relic.tui" prompt twice, because two parts of the TUI read the stored password at the same time before the first read finished. Concurrent reads now share a single keychain request.

## 0.0.1

### Patch Changes

- 19a539d: Add beta support for Windows. `relic run` now starts commands on Windows with a cleared environment and an allowlist of system variables, finds `.cmd` and `.bat` shims such as `npm.cmd` through `PATHEXT`, stays alive through Ctrl+C to report the command's exit code, and loads the runner and TUI libraries correctly from the standalone `relic.exe`. Config lives in `%APPDATA%\relic`, the password file fallback is restricted to the current user on every platform, and `relic upgrade` detects the binary that is actually running (including Scoop and install-script installs) and explains how to upgrade when Windows locks `relic.exe`. A PowerShell installer is available at `irm https://withrelic.com/install.ps1 | iex`.
- Updated dependencies [9c05d01]
- Updated dependencies [aac60a8]
- Updated dependencies [aac60a8]
- Updated dependencies [aac60a8]
- Updated dependencies [aac60a8]
- Updated dependencies [2e6fad8]
  - @repo/backend@0.1.0
