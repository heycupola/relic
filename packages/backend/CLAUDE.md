# Relic Backend - Development Guide for Claude

This is the backend for Relic, a zero-knowledge secret management platform. The backend is built with Convex and handles all server-side logic, database operations, and billing integration.

## Tech Stack

- **Convex** - Real-time serverless database and backend (NOT Express, NOT traditional REST API)
- **Better-Auth** - Authentication (user sync handled via internal mutations)
- **Autumn** - Subscription and usage-based billing system
- **TypeScript** - All code is strictly typed
- **Bun** - Runtime (NOT Node.js)

## Critical Architecture Notes

### Convex Specifics

This project uses **Convex**, not a traditional backend framework:

- **No Express/Fastify/Hapi** - Convex handles HTTP automatically
- **Queries vs Mutations** - Read operations use `protectedQuery`, writes use `protectedMutation`
- **Real-time by default** - All queries are reactive, clients get live updates
- **Built-in auth** - Using custom middleware (`protectedQuery`/`protectedMutation`) that extracts `ctx.userId`
- **Internal functions** - Use `internalMutation` for cron jobs and system tasks
- **No manual database migrations** - Schema changes are automatic via `convex/schema.ts`

### Zero-Knowledge Encryption

**CRITICAL:** The backend NEVER sees plaintext secrets:

- All encryption happens client-side
- Server only stores encrypted blobs
- Private keys encrypted with user passwords (never sent to server)
- Organization keys wrapped with RSA public keys

**Never use JSDoc-style or emoji comments**

## Database Schema

All tables defined in `convex/schema.ts`:

- `user` - Users synced from Better-Auth
- `userKey` - RSA key pairs (encrypted private keys)
- `organizationSetting` - Org billing and config
- `organizationMember` - Membership with wrapped keys
- `project` - Personal or organization projects
- `environment` - Deployment environments (dev/staging/prod)
- `folder` - Secret organization within environments
- `secret` - Encrypted secrets (zero-knowledge)
- `secretHistory` - Audit trail for secrets
- `accessLog` - Security audit logs
- `keyRotation` - Encryption key rotation history

## Access Control Implementation

### Security Layers (Applied in Order)

Every handler enforcing access follows this pattern:

1. **Resource exists check**
   ```typescript
   const project = await ctx.db.get(args.projectId);
   if (!project) throw new Error("Project not found");
   ```

2. **Archive check** (if applicable)
   ```typescript
   if (project.isArchived) {
     throw new Error("This project is archived. Unarchive it to access its data.");
   }
   ```

3. **Organization suspension check**
   ```typescript
   await checkProjectOrganizationSuspended(ctx, project);
   // or
   await checkOrganizationSuspended(ctx, organizationId);
   ```

4. **Project restriction check** (for personal projects)
   ```typescript
   const accessCheck = await isProjectAccessible(ctx, projectId);
   if (!accessCheck.accessible) {
     throw new Error("This project is restricted. Upgrade your plan or archive other projects to access it.");
   }
   ```

5. **Permission check**
   ```typescript
   if (!(await canWriteProject(ctx, project))) {
     throw new Error("You do not have permission...");
   }
   ```

### Permission Helpers

Located in `lib/access.ts`:

- `hasProjectAccess(ctx, project)` - Can user view? (all roles)
- `canWriteProject(ctx, project)` - Can user edit? (excludes viewer)
- `canAdminProject(ctx, project)` - Can user manage? (owner/admin only)
- `isProjectOwner(ctx, project)` - Is user the owner?

For personal projects: checks if `project.ownerId === ctx.userId`
For org projects: checks organization membership and role

## Billing Integration (Autumn)

### Feature Tracking

**User-level features:**
- `personal_projects` - Free: 2, Pro: 10
- `can_create_org` - Pro only
- `free_org` - One free org with Pro plan

**Organization-level features:**
- `organization_projects` - 10 per org subscription
- `members` - 5 included, can purchase more

### Usage Tracking Pattern

Always track when creating/deleting resources:

```typescript
// After creating
await autumn.track(ctx, {
  featureId: "personal_projects",
  value: 1,
});

// After archiving/deleting
await autumn.track(ctx, {
  featureId: "personal_projects",
  value: -1,
});
```

### Checking Limits

```typescript
const { data, error } = await autumn.check(ctx, {
  featureId: "personal_projects",
});

if (!data.allowed) {
  throw new Error(`Limit reached...`);
}
```

## Key Business Logic

### Project Restrictions (Personal Projects)

**Plan Downgrade Flow:**
1. User downgrades from Pro to Free
2. `planDowngradedAt` timestamp set in user record
3. Grace period: 7 days to keep all projects
4. After grace period: restrict to newest 2 projects
5. Restricted projects become inaccessible but not deleted
6. User can archive old projects to free quota for new ones

**Implementation:**
- `lib/projectAccess.ts` - Core restriction logic
- Request-level caching prevents redundant checks
- Cache cleared on plan changes
- Cron job (`checkAllUserPlanStatus`) runs daily at 03:00 UTC

### Organization Suspension

**Subscription Status:**
- `active` - All good
- `payment_lapsed` - 7-day grace period started
- `suspended` - Access blocked

**Flow:**
1. Payment fails → status becomes `payment_lapsed`
2. 7 days pass → status becomes `suspended`
3. All org operations blocked when suspended
4. Payment restored → instant reactivation

**Implementation:**
- `lib/organizationAccess.ts` - Suspension checks
- Cron job (`checkAllSubscriptionStatus`) runs daily at 02:00 UTC
- Free orgs never get suspended (they're free forever)

### Free Organization Transfer

**Rules:**
- User with Pro plan gets 1 free org
- Free orgs can be transferred (remain free)
- New owner cannot already own a free org
- Max 1 free org per user (created or transferred)
- Transfer validates via `by_billing_user` index

**Implementation:**
```typescript
const newOwnerFreeOrg = await ctx.db
  .query("organizationSetting")
  .withIndex("by_billing_user", (q) => q.eq("billingUserId", newOwnerUserId))
  .filter((q) => q.eq(q.field("isFreeWithProPlan"), true))
  .first();

if (newOwnerFreeOrg) {
  throw new Error("New owner already owns a free organization...");
}
```

### Archive/Unarchive Projects

**Archive:**
- Only owner can archive
- Reduces quota count
- Blocks all access to env/folder/secret
- Tracks `-1` to Autumn

**Unarchive:**
- Only owner can unarchive
- Checks quota before allowing
- Restores full access
- Tracks `+1` to Autumn

## Cron Jobs

Defined in `convex/crons.ts`:

**02:00 UTC** - `organization.checkAllSubscriptionStatus`
- Checks all paid organizations
- Updates subscription status
- Handles grace period → suspension transition

**03:00 UTC** - `user.checkAllUserPlanStatus`
- Checks all users
- Detects plan upgrades/downgrades
- Sets/clears `planDowngradedAt` flag

## Common Patterns

### Creating Resources

```typescript
export const createSomething = protectedMutation({
  args: {
    // Define args with v.* validators
  },
  handler: async (ctx: ProtectedMutationCtx, args: { ... }) => {
    // 1. Get parent resource
    const parent = await ctx.db.get(args.parentId);
    if (!parent) throw new Error("Parent not found");

    // 2. Check archive status
    if (parent.isArchived) throw new Error("...");

    // 3. Check org suspension
    await checkProjectOrganizationSuspended(ctx, project);

    // 4. Check project restriction
    const accessCheck = await isProjectAccessible(ctx, projectId);
    if (!accessCheck.accessible) throw new Error("...");

    // 5. Check permissions
    if (!(await canWriteProject(ctx, project))) throw new Error("...");

    // 6. Check Autumn limits (if applicable)
    const { data, error } = await autumn.check(ctx, { ... });
    if (!data.allowed) throw new Error("...");

    // 7. Validate uniqueness (if needed)
    const existing = await ctx.db.query("...").first();
    if (existing) throw new Error("...");

    // 8. Create resource
    const now = Date.now();
    const id = await ctx.db.insert("table", {
      // fields...
      createdBy: ctx.userId,
      createdAt: now,
      updatedAt: now,
    });

    // 9. Track usage (if applicable)
    await autumn.track(ctx, { ... });

    return { success: true, id };
  },
});
```

### Querying Resources

```typescript
export const getSomething = protectedQuery({
  args: { id: v.id("table") },
  handler: async (ctx: ProtectedQueryCtx, args: { id: Id<"table"> }) => {
    const resource = await ctx.db.get(args.id);
    if (!resource) throw new Error("Not found");

    const project = await ctx.db.get(resource.projectId);
    if (!project) throw new Error("Project not found");

    if (project.isArchived) throw new Error("...");

    await checkProjectOrganizationSuspended(ctx, project);

    const accessCheck = await isProjectAccessible(ctx, resource.projectId);
    if (!accessCheck.accessible) throw new Error("...");

    if (!(await hasProjectAccess(ctx, project))) {
      throw new Error("No access");
    }

    return {
      // Return only necessary fields
    };
  },
});
```

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

## DO NOT

- Use Express, Koa, or any HTTP framework
- Use Node.js-specific packages (use Bun equivalents)
- Use npm/yarn/pnpm (use `bun install`)
- Add emojis to code or comments
- Use JSDoc-style comments
- Skip security layer checks
- Return sensitive data unnecessarily
- Use `any` types in handlers

## DO

- Explicitly type all handler args and return types
- Follow the 5-layer security check pattern
- Track Autumn usage on create/delete
- Use soft deletes (`isDeleted` flag) for important data
- Clear request-level cache on plan changes
- Use Convex indexes for efficient queries
- Return minimal data from queries
