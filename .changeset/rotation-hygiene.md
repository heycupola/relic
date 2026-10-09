---
"@repo/backend": minor
"@repo/cli": minor
"@repo/tui": minor
---

Add secret rotation tracking. Each secret now records when its value last changed (renames, moves, scope changes, and project key rotation don't reset it), and rotation policies can be set per environment or per secret, with the secret policy taking precedence. New `relic rotation status`, `relic rotation set`, and `relic rotation clear` commands report ages and statuses, and `--fail-on-overdue` fails CI when a secret is overdue, using either a session or `RELIC_SERVICE_TOKEN`. The TUI shows value age and due or overdue markers next to secrets, and `r` sets a policy from the secret or environment view. The web dashboard lists overdue and due-soon secrets, and an opt-in weekly email digest lists overdue secrets. Only names, timestamps, and policies are used; values are never decrypted. Existing secrets are backfilled with `rotation:_backfillValueChangedAt`.
