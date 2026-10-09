# @repo/backend

Convex backend for Relic. Provides the database schema, server functions, HTTP routes, authentication, billing, and email infrastructure.

## Tech Stack

- **Convex** -- Serverless database and backend functions
- **Better Auth** -- Authentication (Google, GitHub OAuth, device flow)
- **Autumn** -- Subscription billing and usage-based add-ons (on Stripe)
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

| Table              | Description                                         |
| ------------------ | --------------------------------------------------- |
| `project`          | Projects with encrypted key, archive status, owner  |
| `projectShare`     | Project sharing (encrypted key per collaborator)    |
| `environment`      | Environments per project (dev, staging, production) |
| `folder`           | Folders within environments                         |
| `secret`           | Encrypted secrets with scope, tags, soft delete     |
| `keyRotation`      | Key rotation audit records                          |
| `actionLog`        | Full audit trail for all actions                    |
| `apiKey`           | Hashed API keys with scopes and expiration          |
| `serviceAccount`   | CI/CD service accounts with OIDC policies           |
| `onboarding`       | User onboarding data (source, team size)            |
| `processedWebhook` | Webhook idempotency records                         |
| `billingSync`      | Pending Autumn usage sync per user                  |
| `deletedAccount`   | Anonymized records of deleted accounts              |

## HTTP Routes

| Method | Path                     | Description                              |
| ------ | ------------------------ | ---------------------------------------- |
| POST   | `/api/secrets/export`    | Export secrets (API key auth)            |
| GET    | `/api/user/keys`         | Get user crypto keys (API key auth)      |
| POST   | `/api/sa/secrets/export` | Export secrets (service token or OIDC)   |
| POST   | `/webhook/autumn`        | Autumn webhook, schedules a plan refresh |
| POST   | `/webhook/resend`        | Resend email webhook (Svix signature)    |
| GET    | `/health`                | Health check                             |

Auth routes are registered by Better Auth.

## Server Functions

| Module              | Scope                                                               |
| ------------------- | ------------------------------------------------------------------- |
| `user.ts`           | Current user, checkout/portal links, account deletion, cron emails  |
| `billing.ts`        | Plan refresh from Autumn, usage sync, billing overview              |
| `userKey.ts`        | Encryption key storage and rotation                                 |
| `project.ts`        | Project CRUD, archive/unarchive, plan-gated creation                |
| `projectShare.ts`   | Collaborator sharing, revocation, atomic key rotation               |
| `serviceAccount.ts` | Service accounts, OIDC policies, token validation                   |
| `environment.ts`    | Environment CRUD, reordering                                        |
| `folder.ts`         | Folder CRUD                                                         |
| `secret.ts`         | Secret CRUD, history, soft delete/restore, bulk operations, export  |
| `apiKey.ts`         | API key creation, revocation, validation                            |
| `actionLog.ts`      | Audit log queries (by resource, by user)                            |
| `deviceAuth.ts`     | Device code OAuth flow (code generation, polling, approval)         |
| `emails.ts`         | Scheduled email delivery                                            |
| `resend.ts`         | Email rendering and sending (React Email templates)                 |
| `webhook.ts`        | Webhook idempotency                                                 |
| `crons.ts`          | Plan reconcile (02:00), restriction emails (03:00), cleanup (04:00) |
| `rateLimiter.ts`    | Rate limit configuration                                            |

## Lib

| Module          | Description                                              |
| --------------- | -------------------------------------------------------- |
| `plans.ts`      | Plan limits, add-on prices, grace period and access math |
| `autumn.ts`     | Thin Autumn SDK wrapper (the only module that calls it)  |
| `data.ts`       | Shared database loaders                                  |
| `middleware.ts` | Authenticated query/mutation/action builders             |
| `access.ts`     | Permission and ownership checks                          |
| `types.ts`      | Shared types, enums, constants                           |
| `errors.ts`     | Error formatting and HTTP error responses                |
| `crypto.ts`     | Server-side hashing (API key hashing)                    |
| `oidc.ts`       | OIDC token validation for service accounts               |
| `svix.ts`       | Webhook signature verification                           |
| `rateLimit.ts`  | Rate limit definitions                                   |
| `site.ts`       | Site URL resolution                                      |
| `logger.ts`     | Structured logging                                       |

## Access Control

All handlers enforce checks in this order:

1. Resource exists
2. Project not archived
3. User owns the project or has an active share
4. Shared access requires the project to be within the owner's plan

## Billing

Entitlements live on the user record (`hasPro`, `planDowngradedAt`) and are checked inside the same mutation that creates a project or share, so limits cannot be raced. Autumn is the source of truth for the subscription:

- Checkout and billing portal links are created through `lib/autumn.ts`.
- The Autumn webhook, and `billing.refreshMyPlan` after checkout, schedule `billing._refreshPlan`, which reads the customer from Autumn and applies it.
- Paid add-on usage (extra projects, extra shares) is reported to Autumn by a single-flight `billingSync` job that only sends the delta.

| Plan | Price    | Projects | Collaborators per project | Add-ons                                  |
| ---- | -------- | -------- | ------------------------- | ---------------------------------------- |
| Free | $0       | 1        | Sharing not available     | --                                       |
| Pro  | $9/month | 5        | 5                         | $2 per extra project, $1 per extra share |

A downgrade starts a 7-day grace period. After it ends, collaborators keep access only to the newest project within the Free allowance. Owners keep access to all their projects and can archive extras or upgrade. A daily cron re-checks paying and grace-period users against Autumn (a safety net for missed webhooks), then emails affected owners.

Required environment variables: `AUTUMN_SECRET_KEY`, `AUTUMN_WEBHOOK_SECRET`.

## Structure

```
├── index.ts                # Re-exports api, types, enums
├── convex/
│   ├── schema.ts           # Database schema
│   ├── http.ts             # HTTP routes
│   ├── crons.ts            # Scheduled jobs
│   ├── auth.ts             # Better Auth setup
│   ├── auth.config.ts      # Auth configuration
│   ├── convex.config.ts    # Convex component config
│   ├── billing.ts          # Plan refresh and usage sync
│   ├── user.ts, project.ts, projectShare.ts, serviceAccount.ts, ...
│   ├── betterAuth/         # Local Better Auth component
│   └── lib/
│       ├── plans.ts        # Pricing and limits
│       ├── autumn.ts       # Autumn SDK wrapper
│       ├── access.ts, data.ts, middleware.ts, errors.ts, ...
│       └── emails/         # React Email templates
└── test/                   # convex-test suites
```

## Development

```bash
bun run dev              # Start Convex dev server
bun run test             # Run tests
bun run test:watch       # Watch mode
```
