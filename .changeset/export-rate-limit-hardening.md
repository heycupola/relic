---
"@repo/backend": patch
---

Add per-identity rate limits for secret export endpoints. API key exports are now limited to 30/min (burst 10) keyed on API key ID, service account exports to 12/min (burst 6) keyed on service account ID. This replaces the previous IP-based limits which could be bypassed via spoofed x-forwarded-for headers.
