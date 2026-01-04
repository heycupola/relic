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

## Commands
- `bun run dev`: Run Convex dev server.
- `bun run test`: Run backend tests (`convex/test/`).
