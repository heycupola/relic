# Cloudflare Workers Deployment

## Local Deploy

Required environment variables:

```bash
export CLOUDFLARE_API_TOKEN="your-token"
export CLOUDFLARE_ACCOUNT_ID="your-account-id"
```

From `apps/web`:

1. Dev server (port 3000)
   - `bun run dev`
2. Preview (builds and runs locally in Workers runtime)
   - `bun run preview`
3. Deploy
   - `bun run deploy`

## CI/CD

Workflow: `.github/workflows/deploy-web.yml`

- **PR to main**: build + type check (no deploy)
- **Push to main**: build + deploy production

Required GitHub Secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

## Architecture

- `next.config.js` — Next.js configuration
- `open-next.config.ts` — OpenNext adapter configuration
- `wrangler.jsonc` — Cloudflare Workers config (no secrets stored)
- `.open-next/` — Build output (gitignored)
