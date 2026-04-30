# @repo/backend

Convex backend for Relic. Provides the database schema, server functions, HTTP routes, authentication, billing, and email infrastructure.

## Tech Stack

- **Convex** -- Serverless database and backend functions
- **Better Auth** -- Authentication (Google, GitHub OAuth)
- **Stripe** -- Subscription billing
- **Autumn** -- Usage tracking
- **Resend** -- Transactional email (React Email templates)
- **@convex-dev/rate-limiter** -- Rate limiting

## Exports

Re-exported from `index.ts` for use by other packages:

```typescript
import { api, internal } from "@repo/backend";
import type { Doc, Id } from "@repo/backend";
```

Enums: `ApiKeyScope`, `EmailKind`, `ErrorSeverity`, `SecretValueType`.

## Schema

| Table | Description |
|-------|-------------|
| `project` | Projects with encrypted key, archive status, owner |
| `projectShare` | Project sharing (encrypted key per collaborator) |
| `environment` | Environments per project (dev, staging, production) |
| `folder` | Folders within environments |
| `secret` | Encrypted secrets with scope, tags, soft delete |
| `keyRotation` | Key rotation audit records |
| `actionLog` | Full audit trail for all actions |
| `apiKey` | Hashed API keys with scopes and expiration |
| `onboarding` | User onboarding data (source, team size) |
| `deletedAccount` | Anonymized records of deleted accounts |

## HTTP Routes

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/secrets/export` | Export secrets (API key auth) |
| GET | `/api/user/keys` | Get user crypto keys (API key auth) |
| POST | `/webhook/autumn` | Autumn billing webhook (Svix signature) |
| POST | `/webhook/resend` | Resend email webhook (Svix signature) |
| GET | `/health` | Health check |

Auth routes are registered by Better Auth.

## Server Functions

| Module | Scope |
|--------|-------|
| `user.ts` | User CRUD, plan sync, account deletion, email handling |
| `userKey.ts` | Encryption key storage and rotation |
| `project.ts` | Project CRUD, archive/unarchive, restriction checks |
| `projectShare.ts` | Collaborator sharing, revocation, key rotation |
| `environment.ts` | Environment CRUD, reordering |
| `folder.ts` | Folder CRUD |
| `secret.ts` | Secret CRUD, history, soft delete/restore, bulk operations, export |
| `apiKey.ts` | API key creation, revocation, validation |
| `actionLog.ts` | Audit log queries (by resource, by user) |
| `deviceAuth.ts` | Device code OAuth flow (code generation, polling, approval) |
| `autumn.ts` | Usage tracking and plan checks |
| `autumnWebhook.ts` | Billing lifecycle webhook handling |
| `resend.ts` | Email sending (React Email templates) |
| `crons.ts` | Daily plan status checks (03:00 UTC) |
| `rateLimiter.ts` | Rate limit configuration |

## Lib

| Module | Description |
|--------|-------------|
| `middleware.ts` | Auth middleware for queries/mutations |
| `access.ts` | Permission and ownership checks |
| `types.ts` | Shared types, enums, constants |
| `errors.ts` | Error formatting and HTTP error responses |
| `crypto.ts` | Server-side hashing (API key hashing) |
| `helpers.ts` | General utilities |
| `rateLimit.ts` | Rate limit definitions |
| `resend.ts` | Resend signature verification |
| `logger.ts` | Structured logging |

## Access Control

All handlers enforce checks in this order:

1. Resource exists
2. Project not archived
3. Project not restricted (plan limits)
4. User has ownership or share permission

## Plan Limits

| Plan | Project Limit |
|------|---------------|
| Free | 2 |
| Pro | 10 |

Downgrade triggers a 7-day grace period. Newest projects remain accessible. Daily cron syncs plan status.

## Structure

```
├── index.ts                    # Re-exports api, types, enums
├── convex/
│   ├── schema.ts               # Database schema
│   ├── http.ts                 # HTTP routes
│   ├── crons.ts                # Scheduled jobs
│   ├── auth.ts                 # Better Auth setup
│   ├── auth.config.ts          # Auth configuration
│   ├── convex.config.ts        # Convex component config
│   ├── rateLimiter.ts          # Rate limiter setup
│   ├── user.ts
│   ├── userKey.ts
│   ├── project.ts
│   ├── projectShare.ts
│   ├── environment.ts
│   ├── folder.ts
│   ├── secret.ts
│   ├── apiKey.ts
│   ├── actionLog.ts
│   ├── deviceAuth.ts
│   ├── autumn.ts
│   ├── autumnWebhook.ts
│   ├── resend.ts
│   └── lib/
│       ├── middleware.ts
│       ├── access.ts
│       ├── types.ts
│       ├── errors.ts
│       ├── crypto.ts
│       ├── helpers.ts
│       ├── rateLimit.ts
│       ├── resend.ts
│       └── logger.ts
```

## Development

```bash
bun run dev              # Start Convex dev server
bun run test             # Run tests
bun run test:watch       # Watch mode
```
