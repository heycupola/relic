---
"@repo/backend": minor
"@repo/cli": minor
"@repo/tui": minor
---

Add secret history and rollback. Updates and deletes (single and bulk) now keep the previous encrypted value, and deleted secrets can be restored. Retention keeps the last 10 versions per secret on Free and 50 on Pro, based on the project owner's plan. New `relic history` and `relic rollback` commands, and a TUI history view (`t`) with restore. Restores are logged as `secret.restored`. Key rotation re-encrypts history on the owner's device, and the server purges any history left on the old key.
