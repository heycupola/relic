# Relic Backend - Context

Zero-knowledge backend using Convex. Supports real-time database operations and Better Auth.

## Tech Stack
- **Convex**: Serverless database and functions (Queries, Mutations, Actions).
- **Better Auth**: User management via Convex component.
- **Autumn**: Usage/billing tracking.

## Schema Highlights (`schema.ts`)
- `project`: Personal projects (encrypted keys).
- `environment`: Deployment environments.
- `folder`: Nested organisation.
- `secret`: Zero-knowledge blobs.
- `actionLog`: Audit trail for all operations.

## Core Patterns
- **Access Control**: Use `assertProjectAccess(ctx, project, sector, actions)` from `lib/access`.
- **Error Handling**: Use helpers from `lib/errors` (`notFoundError`, `permissionError`).
- **Rate Limiting**: Use `checkRateLimit(ctx, type)` BEFORE performing operations.
- **Internal Functions**: Use `internalMutation/Query` for system tasks (prefixed with `_`).

## Zero-Knowledge Rules
- Plaintext secrets MUST NEVER reach the backend.
- Use `protectedMutation/Action` to inject `ctx.userId` and `ctx.email`.

## Share Limits Model (Hybrid)
Project sharing uses a hybrid model:

### Free Shares (Project-based)
- `shareLimits.freeShareLimit`: 5 free shares per project
- Tracked locally in `project.shareUsageCount`

### Paid Shares (User-based Pool)
- `additional_shares` feature in Autumn
- User-level pool shared across ALL projects
- Autumn does NOT know which project uses which share

### Overlimit Check (`shareProject`)
When `additional_shares.usage > additional_shares.included_usage`:
- User is overlimit across all projects
- Block new shares on ANY project
- User must revoke shares from any project(s) to reduce total paid usage

### Important
- This is intentionally a hybrid model for flexibility
- Overlimit affects all projects equally (shared pool)
- Response includes `requiresRemoval: true` with `excessCount`

## Commands
- `bun run dev`: Run Convex dev server.
- `bun run test`: Run backend tests (`convex/test/`).
