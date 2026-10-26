---
"@repo/cli": patch
---

Move MCP `run-with-secrets` env-dump opt-in off model-settable tool args. Operators enable dumps only with `relic mcp --allow-dangerous-env-dump`, `RELIC_MCP_ALLOW_DANGEROUS_ENV_DUMP=true`, or `[mcp] allow_dangerous_env_dump = true` in `relic.toml` (default refused).
