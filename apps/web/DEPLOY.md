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
2. Production build
   - `bun run build`
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

- `vite.config.ts` — Vite config with vinext plugin
- `wrangler.jsonc` — Cloudflare Workers config (no secrets stored)
- `worker/index.ts` — Source worker entry (used by vinext dev)
- `dist/worker-entry.js` — Generated worker entry for deploy (created by `predeploy` script)
