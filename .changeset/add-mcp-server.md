---
"@repo/cli": minor
---

Add built-in MCP server for AI assistants. Run `relic mcp` to start a stdio-based Model Context Protocol server that integrates with Cursor, Claude Code, Codex, Zed, OpenCode, and Claude Desktop.

Available tools:
- `whoami` — show the authenticated user
- `list-projects` — list all projects with environments and folders
- `list-secrets` — list secret key names, scopes, and types (never values)
- `get-current-project` — read project config from relic.toml
- `run-with-secrets` — run a command with secrets injected as environment variables

Secret values are never exposed to the AI. The server inherits Relic's client-side encryption model — `list-secrets` returns names only, and `run-with-secrets` returns command output only.
