# Relic Backend - Development Guide for Claude

This is the backend for Relic, a zero-knowledge secret management platform. The backend is built with Convex and handles all server-side logic, database operations, and billing integration.

## Tech Stack

- **Convex** - Real-time serverless database and backend (NOT Express, NOT traditional REST API)
- **Better-Auth** - Authentication via component system
- **Autumn** - Subscription and usage-based billing system
- **TypeScript** - All code is strictly typed
- **Bun** - Runtime (NOT Node.js)

## Critical Architecture Notes

### Convex Specifics

This project uses **Convex**, not a traditional backend framework:

- **No Express/Fastify/Hapi** - Convex handles HTTP automatically
- **Queries vs Mutations vs Actions** - Read operations use `protectedQuery`, writes use `protectedMutation`, external service calls use `protectedAction`
- **Real-time by default** - All queries are reactive, clients get live updates
- **Custom middleware** - `protectedQuery`/`protectedMutation`/`protectedAction` inject `ctx.userId`, `ctx.email`, and `ctx.autumn`
- **Internal functions** - Use `internalMutation`/`internalQuery` for cron jobs and cross-module calls
- **Component system** - Better Auth runs as a Convex component (`components.betterAuth.*`)
- **No manual database migrations** - Schema changes are automatic via `convex/schema.ts`

### Zero-Knowledge Encryption

**CRITICAL:** The backend NEVER sees plaintext secrets:

- All encryption happens client-side
- Server only stores encrypted blobs
- Private keys encrypted with user passwords (never sent to server)
- Backend has NO ability to decrypt secrets

**Never use JSDoc-style or emoji comments**

## Database Schema

All tables defined in `convex/schema.ts`:

**Core Tables:**
- `user` - Users (managed by Better Auth component)
- `userKey` - RSA key pairs (encrypted private keys, public keys, salt)
- `project` - Personal projects
- `environment` - Deployment environments (dev/staging/prod)
- `folder` - Secret organization within environments
- `secret` - Encrypted secrets (zero-knowledge)

**Audit & Security:**
- `actionLog` - Audit trail for all secret operations

**Device Auth:**
- `deviceCode` - OAuth2 device flow codes for CLI authentication
- `session` - User sessions from device auth

**Rate Limiting:**
- `rateLimitBucket` - Token bucket state per user/resource

## Access Control Implementation

### New Pattern: `assertProjectAccess`

**Modern approach** (use this):

```typescript
import { assertProjectAccess, Sector } from "./lib/access";

// Automatically handles ALL security checks in one call
await assertProjectAccess(ctx, project, Sector.Secret, ["create"]);
```

**What it checks:**
1. ✅ Resource exists
2. ✅ Not archived
3. ✅ Project not restricted
4. ✅ User has correct permission for the action

**Available Sectors:**
```typescript
enum Sector {
  Project = "project",
  Environment = "environment",
  Folder = "folder",
  Secret = "secret",
}
```

**Available Actions:**
```typescript
["read"]           // View only
["create"]         // Create new resources
["update"]         // Modify existing
["delete"]         // Remove resources
["read", "create"] // Multiple actions
```

### Legacy Pattern (deprecated but still in use)

Manual checks in order:

1. Resource exists check
2. Archive check
3. Project restriction check
4. Permission check

**Gradually migrate to `assertProjectAccess` pattern.**

## Error Handling (NEW!)

### Centralized Error Factory

**Location:** `lib/errors.ts`

**Before** (74 inconsistent error codes):
```typescript
throw new ConvexError({
  code: "SECRET_NOT_FOUND",
  message: "Secret has not found", // ❌ Grammar error
  severity: ErrorSeverity.High,
});
```

**After** (40 standardized codes):
```typescript
import { notFoundError } from "./lib/errors";

throw notFoundError("secret"); // ✅ Consistent message
```

### Available Error Helpers

**notFoundError:**
```typescript
notFoundError("user" | "project" | "environment" | "folder" | "secret" | "request")
```

**permissionError:**
```typescript
permissionError("create secrets")  // Custom action message
permissionError()                   // Generic permission denied
```

**limitReachedError:**
```typescript
limitReachedError("personal_projects", currentCount, limit)
limitReachedError("environments", currentCount, limit)
```

**deviceAuthError:**
```typescript
deviceAuthError("not_found")
deviceAuthError("expired")
deviceAuthError("already_used")
deviceAuthError("pending")
deviceAuthError("denied")
deviceAuthError("polling_too_fast")
```

**createError (custom):**
```typescript
import { ErrorCode, createError } from "./lib/errors";

throw createError({
  code: ErrorCode.RATE_LIMIT_EXCEEDED,
  message: "Custom message",  // Optional override
  severity: ErrorSeverity.High,
  metadata: { /* extra data */ }
});
```

### When to Use Each

- **NOT_FOUND errors:** Always use `notFoundError()`
- **Permission errors:** Use `permissionError()`
- **Limit errors:** Use `limitReachedError()`
- **Device auth:** Use `deviceAuthError()`
- **Custom/unique errors:** Use `createError()` with appropriate `ErrorCode`

**See `lib/errors.ts` for the complete list of error codes.**

## Rate Limiting (NEW!)

**All public endpoints now have rate limiting.**

### Implementation

```typescript
import { checkRateLimit } from "./lib/rateLimit";

// Read operations
await checkRateLimit(ctx, "read");

// Write operations
await checkRateLimit(ctx, "write");

// Delete operations
await checkRateLimit(ctx, "delete");

// Custom identifier (for per-resource limits)
await checkRateLimit(ctx, "write", args.device_code);
```

### Rate Limit Order

**CRITICAL:** Rate limits MUST be checked BEFORE performing operations:

```typescript
// ✅ CORRECT
await checkRateLimit(ctx, "write");
await ctx.runMutation(internal.project._insert, {...});

// ❌ WRONG - Operation happens before rate check
await ctx.runMutation(internal.project._insert, {...});
await checkRateLimit(ctx, "write");
```

### Rate Limit Types

- **read** - Queries (higher limit)
- **write** - Mutations (standard limit)
- **delete** - Deletions (same as write)

Rate limits use token bucket algorithm with per-user and per-resource tracking.

## Billing Integration (Autumn)

### Feature Tracking

**User-level features:**
- `personal_projects` - Free: 2, Pro: 10

### Usage Tracking Pattern

Always track when creating/archiving resources:

```typescript
// After creating
await ctx.autumn.track(ctx, {
  featureId: "personal_projects",
  value: 1,
});

// After archiving/deleting
await ctx.autumn.track(ctx, {
  featureId: "personal_projects",
  value: -1,
});
```

### Checking Limits

```typescript
// Personal features
const { data, error } = await ctx.autumn.check(ctx, {
  featureId: "personal_projects",
});

if (!data.allowed) {
  throw limitReachedError("personal_projects", data.current, data.limit);
}
```

### Checkout Flow

```typescript
const checkoutResult = await ctx.autumn.checkout(ctx, {
  productId: "pro",
  successUrl: `${process.env.SITE_URL}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
  cancelUrl: `${process.env.SITE_URL}/subscription/cancel`,
  customerData: {
    name: user.name,
    email: user.email,
  },
  checkoutSessionParams: {
    metadata: {
      userId: ctx.userId,
    },
  },
});

return checkoutResult.data?.url; // Stripe checkout URL
```

## Key Business Logic

### Project Restrictions (Personal Projects)

**Plan Downgrade Flow:**
1. User downgrades from Pro to Free
2. `planDowngradedAt` timestamp set in user record
3. Grace period: 7 days to keep all projects
4. After grace period: restrict access to newest 2 projects
5. Restricted projects become inaccessible but not deleted
6. User can archive old projects to free quota for new ones

**Implementation:**
- `lib/projectAccess.ts` - Core restriction logic
- `lib/access.ts` - `isProjectAccessible()` enforces restrictions
- Cron job (`user.checkAllUserPlanStatus`) runs daily at 03:00 UTC


### Stripe Webhook Integration

**Endpoint:** `/webhook/stripe` (defined in `http.ts`)

**Supported Events:**
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_failed`

**Flow:**
```typescript
// 1. Verify webhook signature
const isValid = await verifyStripeSignature(payload, signature, secret);

// 2. Parse event
const event = JSON.parse(payload);

// 3. Handle user subscription events
if (metadata.userId) {
  // User subscription (Pro plan)
  await internal.user._handlePlanUpgrade({ userId });
  // or
  await internal.user._handlePlanDowngrade({ userId });
}
```

**Security:**
- HMAC-SHA256 signature verification using `crypto.subtle`
- Webhook secret stored in `STRIPE_WEBHOOK_SECRET` env var

### Device Authentication (OAuth2 Device Flow)

**Used for CLI authentication** without opening browsers on headless servers.

**Flow:**
1. CLI calls `deviceAuth.requestDeviceCode()`
2. Returns `user_code` (e.g., "ABCD-1234") and `device_code`
3. CLI displays: "Go to https://app.relic.com/oauth/authorize and enter: ABCD-1234"
4. User opens URL in browser, enters code
5. Web app calls `deviceAuth.approveDeviceCode({ user_code })`
6. CLI polls `deviceAuth.pollDeviceToken({ device_code })`
7. When approved, returns `session_token`

**Endpoints:**
- `requestDeviceCode` - Generate code (public, rate limited)
- `getDeviceCodeInfo` - Check code status (public, rate limited)
- `pollDeviceToken` - Poll for approval (public, rate limited, supports SLOW_DOWN)
- `approveDeviceCode` - User approves (protected, rate limited)
- `denyDeviceCode` - User denies (protected, rate limited)

**Rate Limiting:**
- Request: Custom key "device-auth-request"
- Poll: Per device_code (prevents spam)
- Approve/Deny: Standard write limit

**Implementation:**
- `deviceAuth.ts` - App-level wrapper with rate limiting
- `betterAuth/deviceAuth.ts` - Component-level logic
- Cleanup cron runs hourly to remove expired codes


### Archive/Unarchive Projects

**Archive:**
- Only owner can archive
- Reduces quota count (tracks `-1` to Autumn)
- Blocks all access to env/folder/secret
- Soft delete (project still exists in DB)

**Unarchive:**
- Only owner can unarchive
- Checks quota before allowing (tracks `+1` to Autumn)
- Restores full access
- Can fail if user hit their limit

## Better Auth Component Integration

**Location:** `betterAuth/` directory (component)

**Usage Pattern:**

```typescript
import { components } from "./_generated/api";

// Query user
const user = await ctx.runQuery(components.betterAuth.user.loadUserById, {
  userId: ctx.userId
});
```

**Key Components:**
- `user.ts` - User management, plan upgrades/downgrades
- `deviceAuth.ts` - Device flow logic

**App-level wrappers** (in root `convex/` dir) add:
- Rate limiting
- Autumn tracking
- Additional validation
- Error standardization

## Action Logs (Audit Trail)

**Table:** `actionLog`

**Logged Actions:**
- `secret.created`
- `secret.updated`
- `secret.deleted`
- `secret.exported`
- `secrets.bulk.updated`
- `secrets.bulk_deleted`
- `secrets.bulk_exported`

**Metadata Includes:**
- Project name, environment name
- Secret key (before and after for updates)
- Folder name (if applicable)
- Export format, count
- Affected value count

**Querying:**
```typescript
// By project
await ctx.runQuery(internal.actionLog._loadActionLogsByProject, {
  projectId,
  paginationOpts
});

// By environment
await ctx.runQuery(internal.actionLog._loadActionLogsByEnvironment, {
  environmentId,
  paginationOpts
});
```

**Indexes:**
- `by_project` - For project-level logs
- `by_environment` - For environment-level logs
- `by_user` - For user activity

**Public Endpoints:**
- `loadActionLogsByProject` - Protected action, rate limited (read)
- `loadActionLogsByEnvironment` - Protected action, rate limited (read)

## Cron Jobs

Defined in `convex/crons.ts`:

**03:00 UTC** - `user.checkAllUserPlanStatus`
- Checks all users
- Detects plan upgrades/downgrades via Autumn
- Sets/clears `planDowngradedAt` flag

**Hourly** - `betterAuth.deviceAuth._cleanupExpiredDeviceCodes`
- Removes expired device codes
- Prevents database bloat

## Common Patterns

### Creating Resources (Modern)

```typescript
export const createSomething = protectedMutation({
  args: {
    projectId: v.id("project"),
    name: v.string(),
  },
  handler: async (ctx: ProtectedMutationCtx, args) => {
    // 1. Rate limit check FIRST
    await checkRateLimit(ctx, "write");

    // 2. Load parent resource
    const project = await ctx.runQuery(internal.project._loadProjectById, {
      projectId: args.projectId
    });

    // 3. Check ALL access layers in one call
    await assertProjectAccess(ctx, project, Sector.Environment, ["create"]);

    // 4. Check Autumn limits (if applicable)
    const { data } = await ctx.autumn.check(ctx, {
      featureId: "environments"
    });

    if (!data.allowed) {
      throw limitReachedError("environments", data.current, data.limit);
    }

    // 5. Validate uniqueness (if needed)
    const existing = await ctx.runQuery(internal.environment._loadByProjectAndName, {
      projectId: args.projectId,
      name: args.name
    });
    if (existing) {
      throw alreadyExistsError("environment");
    }

    // 6. Create resource via internal mutation
    const { environment } = await ctx.runMutation(internal.environment._insert, {
      projectId: args.projectId,
      name: args.name,
      createdBy: ctx.userId
    });

    // 7. Track usage (if applicable)
    await ctx.autumn.track(ctx, {
      featureId: "environments",
      value: 1
    });

    return { success: true, environment };
  },
});
```

### Querying Resources (Modern)

```typescript
export const getSomething = protectedQuery({
  args: { id: v.id("secret") },
  handler: async (ctx: ProtectedQueryCtx, args) => {
    // 1. Load resource
    const secret = await ctx.runQuery(internal.secret._loadSecretById, {
      secretId: args.id
    });

    if (!secret) {
      throw notFoundError("secret");
    }

    // 2. Load project
    const project = await ctx.runQuery(internal.project._loadProjectById, {
      projectId: secret.projectId
    });

    // 3. Check access (read permission)
    await assertProjectAccess(ctx, project, Sector.Secret, ["read"]);

    // 4. Return minimal data
    return {
      id: secret._id,
      key: secret.key,
      encryptedValue: secret.encryptedValue,
      encryptionKeyVersion: secret.encryptionKeyVersion,
      primitiveType: secret.primitiveType,
      // DO NOT return: createdBy, updatedBy (unless needed)
    };
  },
});
```

### Internal Mutations Pattern

Use for cross-module calls and cron jobs:

```typescript
export const _insertEnvironment = internalMutation({
  args: {
    projectId: v.id("project"),
    name: v.string(),
    createdBy: v.id("user")
  },
  returns: v.object({
    success: v.boolean(),
    environment: doc(schema, "environment")
  }),
  handler: async (ctx, args) => {
    const now = Date.now();

    const envId = await ctx.db.insert("environment", {
      projectId: args.projectId,
      name: args.name,
      createdBy: args.createdBy,
      createdAt: now,
      updatedAt: now,
      isDeleted: false
    });

    const environment = await ctx.db.get(envId);

    return { success: true, environment: environment! };
  }
});
```

**Key points:**
- Prefix with `_` to indicate internal
- Always add `returns` validator for type safety
- No access checks (caller is responsible)
- Used by: cron jobs, webhooks, other mutations

## Testing with Bun

Use Bun's built-in test runner:

```bash
bun test
```

```typescript
import { test, expect } from "bun:test";

test("example test", () => {
  expect(true).toBe(true);
});
```

**Test files:** `convex/test/`

## Environment Variables

Required in `.env.local`:

```bash
# Convex
CONVEX_DEPLOYMENT=dev:your-deployment

# Better Auth
BETTER_AUTH_SECRET=your-secret-key

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRO_PRICE_ID=price_...

# Autumn
AUTUMN_SECRET_KEY=your-autumn-key

# App
SITE_URL=http://localhost:3000
```

## DO NOT

- Use Express, Koa, or any HTTP framework
- Use Node.js-specific packages (use Bun equivalents)
- Use npm/yarn/pnpm (use `bun install`)
- Add emojis to code or comments
- Use JSDoc-style comments
- Skip security layer checks
- Return sensitive data unnecessarily
- Use `any` types in handlers
- **Check rate limits after operations** (always check first!)
- **Use old error pattern** (migrate to `lib/errors.ts`)
- **Skip `assertProjectAccess`** when available (use it!)
- **Directly access Better Auth tables** (use component queries)

## DO

- Explicitly type all handler args and return types
- Use `assertProjectAccess` for access control (modern pattern)
- Use error helpers from `lib/errors.ts`
- Check rate limits BEFORE operations
- Track Autumn usage on create/archive/delete
- Use soft deletes (`isDeleted` flag) for important data
- Use Convex indexes for efficient queries
- Return minimal data from queries
- Use internal mutations for cross-module calls
- Add `returns` validator to all internal functions
- Use Better Auth component via `components.betterAuth.*`
- Log secret operations to `actionLog`
- Test with Bun

## Migration Checklist

When updating old code:

- [ ] Replace manual access checks with `assertProjectAccess`
- [ ] Replace old error throwing with `lib/errors.ts` helpers
- [ ] Add rate limiting if missing
- [ ] Use Better Auth component instead of direct DB access
- [ ] Add `returns` validator to internal functions
- [ ] Update to use `actionLog` instead of `secretHistory`
- [ ] Ensure proper Autumn tracking on create/delete

For complete API reference, see `README.md`.
