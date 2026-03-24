# Relic OG Worker

Standalone Cloudflare Worker that renders relic's Open Graph images dynamically.

## What it does

- Renders branded OG images for:
  - `home`
  - `blog-index`
  - `changelog-index`
  - `blog-entry`
  - `changelog-entry`
- Caches rendered responses at the edge
- Stays decoupled from Next.js and OpenNext runtime internals
- Uses a bundled local image asset for the `home` card only

The public `/og` URL is still served by the web app, but `apps/web/app/og/route.tsx` now proxies those requests to this worker through a Cloudflare service binding.

## Environment

This worker does not require its own `.env` file.

Production expects:

- the worker name to stay `relic-og`
- the web worker to expose a `RELIC_OG` service binding pointing at `relic-og`

Those bindings are already defined in `apps/web/wrangler.jsonc`.

## Development

Run the OG worker:

```bash
bun run dev
```

If you also want to see the card through `http://localhost:3000/og`, run the web app separately:

```bash
cd ../web
bun run dev
```

The web app will proxy local `/og` requests to `http://127.0.0.1:8787` by default. Override that with `OG_WORKER_DEV_URL` if needed.

## Deploy

This worker is deployed before the web worker by `.github/workflows/deploy-web.yml`.

```bash
bun run deploy
```
