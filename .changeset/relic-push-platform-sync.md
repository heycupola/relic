---
"@repo/cli": minor
"@repo/backend": minor
---

Add `relic push` to sync an environment's secrets into a deploy platform's secret store. Supported targets are Vercel (REST API, using `VERCEL_TOKEN` or the Vercel CLI login), Cloudflare Workers (`wrangler secret bulk` on stdin, with a `CLOUDFLARE_API_TOKEN` API fallback), GitHub Actions (`gh secret set`, repository or environment level), and Fly.io (`fly secrets import`). Values are decrypted locally and sent only to the platform, never written to disk or printed. A names-only plan is shown before writing, `--dry-run` stops after the plan, production-like targets ask for confirmation, CI requires `--yes`, and `--prune` is the only way platform secrets get deleted. `--scope` accepts several scopes, such as `client,shared`.

The secret export endpoints accept an optional `scopes` array and `push` metadata. Push exports record a new `secrets.pushed` audit log action with the target, destination, and count (never values), shown in the dashboard activity feed.
