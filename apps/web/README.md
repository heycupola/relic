# Web App

## Convex Integration

This app uses `@repo/backend` package for Convex API access. All Convex functions are defined in `packages/backend/convex/` and exported via the `@repo/backend` package.

```typescript
import { api } from "@repo/backend";
import { useQuery } from "convex/react";

// Use the generated API for type-safe queries
const data = useQuery(api.project.getProject, { projectId });
```

## Getting Started

```bash
bun install
bun run dev
```

## Content

Blog posts are hand-written MDX files in `content/blog/*.mdx`.

```mdx
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

Changelog entries are read from `content/changelog/**/*.mdx`. In normal use they are generated from GitHub Releases into `content/changelog/generated` with:

```bash
bun run sync:changelog
```

Markdown images are content-friendly by default: they render full-width, preserve aspect ratio, lazy-load, and support `figure` / `figcaption` when needed.
