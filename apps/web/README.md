# Relic Web

Marketing site and dashboard for Relic. Built with Next.js and deployed to Cloudflare Workers via OpenNext.

## Tech Stack

- **Next.js** -- React framework with App Router and RSC
- **OpenNext** -- Cloudflare Workers adapter
- **React 19** -- UI
- **Tailwind CSS** -- Styling
- **Convex** -- Backend (via `@repo/backend`)
- **Better Auth** -- Authentication (Google, GitHub OAuth)
- **PostHog** -- Analytics
- **Cloudflare Workers** -- Deployment target

## Routes

Pages are organized into `(protected)` and `(public)` route groups. Protected pages require authentication and share a centralized auth guard layout.

**Protected** (require auth):

| Route | Description |
|-------|-------------|
| `/dashboard` | Projects, API keys, activity |
| `/dashboard/settings` | Account settings |
| `/onboarding` | Post-signup flow |
| `/oauth/authorize` | CLI device code authorization |

**Public** (no auth required):

| Route | Description |
|-------|-------------|
| `/` | Landing page |
| `/login` | Sign in (Google, GitHub) |
| `/blog` | Blog index |
| `/blog/[slug]` | Blog post |
| `/changelog` | Changelog index |
| `/changelog/[slug]` | Changelog entry |
| `/subscription/success` | Stripe checkout success |
| `/subscription/cancel` | Stripe checkout cancel |
| `/privacy-policy` | Privacy policy |
| `/terms-of-service` | Terms of service |
| `/dpa` | Data processing agreement |
| `/og` | Proxies OG image requests to the standalone OG worker |

RSS feeds available at `/blog/rss.xml` and `/changelog/rss.xml`.

## Environment

Copy `apps/web/.env.example` to `.env.local` for local development.

Required locally:

- `NEXT_PUBLIC_CONVEX_URL`
- `NEXT_PUBLIC_CONVEX_SITE_URL`
- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_BETTER_AUTH_URL`

Optional locally:

- `NEXT_PUBLIC_ENTERPRISE_URL`
- `NEXT_PUBLIC_POSTHOG_KEY`
- `NEXT_PUBLIC_POSTHOG_HOST`
- `GITHUB_TOKEN`
- `GITHUB_REPOSITORY`
- `OG_WORKER_DEV_URL` (defaults to `http://127.0.0.1:8787`)

Production notes:

- The web worker does not use R2 for caching anymore.
- `/og` is served by this app, but image rendering is delegated to the standalone `relic-og` worker via the `RELIC_OG` service binding in `wrangler.jsonc`.
- If you want GitHub star counts in production, add `GITHUB_TOKEN` as a Cloudflare secret on the `relic-web` worker.
- Keep `NEXT_PUBLIC_SITE_URL` and `NEXT_PUBLIC_BETTER_AUTH_URL` aligned with your deployed public domain when building outside the provided GitHub workflow.

## Content

Blog posts are MDX files in `content/blog/*.mdx`:

```yaml
---
title: Post title
description: Short summary
date: 2026-03-07
author: Can Vardar
category: Product
tags:
  - shipping
published: true
---
```

Changelog entries are in `content/changelog/**/*.mdx`. Generated from GitHub Releases with:

```bash
bun run sync:changelog
```

## Structure

```
├── app/
│   ├── (protected)/    # Auth guard layout, dashboard, onboarding, oauth
│   ├── (public)/       # Landing, login, blog, changelog, legal, subscription
│   ├── api/            # Auth API, GitHub stars
│   ├── og/             # Proxy route for the standalone OG worker
│   ├── layout.tsx      # Root layout
│   └── providers.tsx   # Convex, PostHog, theme providers
├── components/         # UI components
├── content/            # MDX content (blog, changelog)
├── lib/                # Utilities (content parsing, auth, site config)
└── scripts/            # Changelog sync
```

## Development

```bash
bun install
```

Start the OG worker in one terminal:

```bash
cd apps/og-worker
bun run dev
```

Start the web app in another terminal:

```bash
cd apps/web
bun run dev
```

Useful local URLs:

- `http://localhost:3000/`
- `http://localhost:3000/og?type=home`
- `http://localhost:3000/og?type=blog-index`
- `http://localhost:3000/og?type=changelog-index`

## Deployment

Production deploys are handled by `.github/workflows/deploy-web.yml`.

Required GitHub Actions secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `CONVEX_URL`
- `CONVEX_SITE_URL`
- `POSTHOG_KEY`

Deploy flow on `main`:

1. Sync changelog content from GitHub Releases.
2. Type check the OG worker and the web app.
3. Build the web app with OpenNext.
4. Deploy `relic-og`.
5. Deploy `relic-web`.

For manual local deploys:

```bash
cd apps/og-worker && bun run deploy
cd apps/web && bun run deploy
```
