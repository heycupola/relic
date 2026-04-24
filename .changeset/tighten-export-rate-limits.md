---
"@repo/backend": patch
---

Tighten per-identity rate limits for secret export endpoints and surface policy on 429s. Both apiKeyExport and serviceAccountExport are now 6 requests/minute with a burst capacity of 3 (down from 30/10 and 12/6 respectively). Normal CI/CD usage (1-2 exports per deploy) is unaffected, but continuous polling clients are now blocked quickly. Rate-limit 429 responses now include Retry-After, X-RateLimit-Limit, and X-RateLimit-Remaining headers so CI logs clearly show the policy and cooldown.
