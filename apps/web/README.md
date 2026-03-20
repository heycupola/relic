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
| `/og` | OG image generation |

RSS feeds available at `/blog/rss.xml` and `/changelog/rss.xml`.

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
│   ├── og/             # OG image generation
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
bun run dev
```

## Deployment

```bash
bun run deploy
```

Build pipeline: `next build` → `opennextjs-cloudflare build` → `wrangler deploy`.
