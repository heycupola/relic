---
"@repo/cli": patch
"@repo/tui": patch
"@repo/logger": patch
---

Tidy the TUI shortcut hints. The guide bar drops the `[key]` brackets, lays shortcuts out in evenly sized rows, and no longer lists the obvious `enter` action. Confirmation prompts (delete, archive, restore) now show their `y`/`n` choices in the guide bar instead of inline, secondary hints and dim labels are easier to read, and the password setup status uses the shared task bar. In development, log output now goes through `console` so the TUI captures it instead of drawing over the screen.
