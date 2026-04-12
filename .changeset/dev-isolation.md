---
"@repo/cli": patch
---

Isolate dev and production data paths: when DEV=true, all config/session/password/cache files use ~/.config/relic-dev/ and keychain service uses com.relic.tui.dev
