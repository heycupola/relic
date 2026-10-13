# @repo/tui

## 0.1.1

### Patch Changes

- eb07261: Tidy the TUI shortcut hints. The guide bar drops the `[key]` brackets, lays shortcuts out in evenly sized rows, and no longer lists the obvious `enter` action. Confirmation prompts (delete, archive, restore) now show their `y`/`n` choices in the guide bar instead of inline, secondary hints and dim labels are easier to read, and the password setup status uses the shared task bar. In development, log output now goes through `console` so the TUI captures it instead of drawing over the screen.
- Updated dependencies [eb07261]
  - @repo/logger@0.0.2

## 0.1.0

### Minor Changes

- aac60a8: Add secret rotation tracking. Each secret now records when its value last changed (renames, moves, scope changes, and project key rotation don't reset it), and rotation policies can be set per environment or per secret, with the secret policy taking precedence. New `relic rotation status`, `relic rotation set`, and `relic rotation clear` commands report ages and statuses, and `--fail-on-overdue` fails CI when a secret is overdue, using either a session or `RELIC_SERVICE_TOKEN`. The TUI shows value age and due or overdue markers next to secrets, and `r` sets a policy from the secret or environment view. The web dashboard lists overdue and due-soon secrets, and an opt-in weekly email digest lists overdue secrets. Only names, timestamps, and policies are used; values are never decrypted. Existing secrets are backfilled with `rotation:_backfillValueChangedAt`.
- aac60a8: Add secret history and rollback. Updates and deletes (single and bulk) now keep the previous encrypted value, and deleted secrets can be restored. Retention keeps the last 10 versions per secret on Free and 50 on Pro, based on the project owner's plan. New `relic history` and `relic rollback` commands, and a TUI history view (`t`) with restore. Restores are logged as `secret.restored`. Key rotation re-encrypts history on the owner's device, and the server purges any history left on the old key.

### Patch Changes

- Updated dependencies [19a539d]
  - @repo/auth@0.0.1
  - @repo/logger@0.0.1
