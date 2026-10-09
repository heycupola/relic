---
"@repo/cli": minor
---

Add `relic guard` to block commits that leak secrets. `relic guard scan` flags committed or staged dotenv files and exact occurrences of your decrypted Relic secret values, matched locally with a multi-pattern search. It scans paths, staged content (`--staged`), or lines added in a commit range (`--range`), prints only key names, locations, and masked previews, supports `--json`, and exits non-zero on findings. `relic guard install` adds a pre-commit hook that chains any existing hook, or prints the snippet for lefthook, husky, and pre-commit (and can edit `lefthook.yml` with consent). Findings can be silenced with a `relic-guard-ignore` comment or a `.relicguardignore` file, and dotenv files can be allowed via `[guard] allow` in `relic.toml`.
