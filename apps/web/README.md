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
