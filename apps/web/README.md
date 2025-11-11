# Web App

## Development Setup

### Convex Integration

This app uses a symlink to share Convex functions from the backend package:

```
apps/web/convex → ../../packages/backend/convex
```

**Why symlink?**
- Single source of truth for Convex schema and functions
- No sync issues between frontend and backend
- Standard pattern in Turborepo + Convex monorepos

**Note for Windows users:**
If symlink doesn't work, you may need to enable Developer Mode in Windows settings.

## Getting Started

```bash
bun install
bun run dev
```
