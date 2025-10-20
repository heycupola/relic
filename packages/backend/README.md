# Relic Backend

Zero-knowledge encrypted secret management backend powered by Convex, Better-Auth, and Autumn billing.

## Tech Stack

- **Convex** - Real-time serverless database and backend functions
- **Better-Auth** - Authentication system
- **Autumn** - Subscription and usage-based billing
- **TypeScript** - Type-safe development
- **Bun** - Fast JavaScript runtime

## Quick Start

```bash
bun install
bun run dev
```

## Architecture

### Core Entities

**Users & Keys**
- Users synced from Better-Auth
- RSA key pairs stored encrypted (zero-knowledge)
- Private keys encrypted with user password (never sent to server)

**Organizations**
- Role-based access: owner, admin, member, viewer
- Free org included with Pro plan (max 1 per user)
- Paid orgs via Autumn subscription
- Encryption key rotation on member removal

**Projects**
- Personal projects (owned by user)
- Organization projects (shared with team)
- Archived project support with unarchive capability

**Environments → Folders → Secrets**
- Environments: dev, staging, production, etc.
- Folders: organize secrets within environments
- Secrets: client-side encrypted with AES-256
- Full audit trail with secret history

### Security Features

- Zero-knowledge encryption (client-side only)
- Organization suspension checks
- Project access restrictions with 7-day grace period
- Archived project access control
- Request-level caching for performance
- Role-based permission checks
- Comprehensive audit logging

## Key Features Implemented

### Plan & Billing

**Personal Projects**
- Free: 2 projects
- Pro: 10 projects
- Restriction system with 7-day grace period
- Newest projects remain accessible after downgrade
- Request-level cache for optimal performance

**Organizations**
- Free org with Pro plan (transferable, max 1 per user)
- Paid orgs: 10 projects, 5 members included
- Subscription status: active → payment_lapsed (7 days) → suspended
- Daily cron jobs sync subscription and plan status

### Access Control Layers

All handlers enforce security in this order:

1. **Resource exists** - Check if project/env/secret exists
2. **Project archived** - Prevent access to archived projects
3. **Organization suspended** - Block suspended org access
4. **Project restricted** - Check personal plan limits
5. **Permission check** - Verify user role permissions

### Organization Management

**Member Removal**
- Owner can remove anyone
- Admins can remove each other + members (not owner)
- Members/viewers can only remove themselves
- Owner leaving requires ownership transfer
- Free org transfer validates new owner doesn't already own one

**Ownership Transfer**
- Free orgs remain free (like GitHub/Vercel)
- Paid orgs transfer billing responsibility
- Validates new owner has available free org slot

### Project Lifecycle

**Archive/Unarchive**
- Only owners can archive projects
- Double archive protection
- Unarchive checks quota before restoring
- Autumn usage tracking on archive/unarchive

**Restrictions**
- Archived projects: no access to env/folder/secret
- Restricted projects: blocked until unarchived or plan upgraded
- Users can always archive restricted projects to free quota

## File Structure

```
convex/
├── schema.ts                    # Database schema
├── crons.ts                     # Daily subscription/plan checks
├── lib/
│   ├── middleware.ts            # Auth middleware
│   ├── access.ts                # Permission helpers
│   ├── organizationAccess.ts    # Org suspension checks
│   ├── projectAccess.ts         # Plan restriction + caching
│   └── types.ts                 # Shared TypeScript types
├── user.ts                      # User CRUD + plan sync
├── organization.ts              # Org management + transfers
├── project.ts                   # Project CRUD + archive
├── environment.ts               # Environment CRUD
├── folder.ts                    # Folder CRUD
└── secret.ts                    # Secret CRUD + history
```

## Client-Side API Reference

### User Management (user.ts)

**Queries:**
- `getCurrentUser()` - Get authenticated user profile

### User Keys (userKey.ts)

**Queries:**
- `getUserKey()` - Get user's encryption keys
- `hasUserKeys()` - Check if user has keys setup

**Mutations:**
- `storeUserKey({ publicKey, encryptedPrivateKey, salt })` - Store user's encryption keys (one-time)
- `updateUserKey({ publicKey, encryptedPrivateKey, salt })` - Rotate user's encryption keys

### Organizations (organization.ts)

**Queries:**
- `listMembers({ organizationId })` - List organization members
- `getUserOrganizations()` - Get user's organization memberships
- `getOrganizationSettings({ organizationId })` - Get organization settings

**Mutations:**
- `initializeOrganization({ organizationId, wrapperOrgKey })` - Create organization
- `addMember({ organizationId, userEmail, role, wrappedOrgKey })` - Add member to organization
- `removeMember({ organizationId, userId, reason, newOwnerUserId? })` - Remove member or transfer ownership
- `rotateOrganizationKeys({ organizationId, newKeyVersion, secrets, members, reason? })` - Rotate encryption keys

### Projects (project.ts)

**Queries:**
- `listUserProjects()` - List personal projects with restriction status
- `listOrganizationProjects({ organizationId })` - List organization projects
- `getProject({ projectId })` - Get project details

**Mutations:**
- `createPersonalProject({ name, slug, description? })` - Create personal project
- `createOrganizationProject({ organizationId, name, slug, description? })` - Create organization project
- `updateProject({ projectId, name?, description? })` - Update project details
- `archiveProject({ projectId })` - Archive project (frees quota)
- `unarchiveProject({ projectId })` - Unarchive project (checks quota)

### Environments (environment.ts)

**Queries:**
- `listEnvironments({ projectId })` - List project environments
- `getEnvironment({ environmentId })` - Get environment details
- `getEnvironmentData({ environmentId, includeDeleted?, includeRecentActivity? })` - Get environment with secrets/folders

**Mutations:**
- `createEnvironment({ projectId, name, slug, description?, color? })` - Create environment
- `updateEnvironment({ environmentId, name?, description?, color?, sortOrder? })` - Update environment
- `deleteEnvironment({ environmentId })` - Delete environment (must be empty)
- `reorderEnvironments({ projectId, environmentIds })` - Reorder environments

### Folders (folder.ts)

**Queries:**
- `listFolders({ environmentId })` - List environment folders
- `getFolder({ folderId })` - Get folder details

**Mutations:**
- `createFolder({ environmentId, name, slug, description? })` - Create folder
- `updateFolder({ folderId, name?, description? })` - Update folder
- `deleteFolder({ folderId })` - Delete folder (must be empty)

### Secrets (secret.ts)

**Queries:**
- `listSecrets({ environmentId, folderId?, includeDeleted? })` - List secrets
- `getSecret({ secretId })` - Get secret with encrypted value
- `listSecretHistory({ secretId })` - Get secret audit history (100 entries)

**Mutations:**
- `createSecret({ environmentId, folderId?, key, encryptedValue, description?, encryptionKeyVersion, tags? })` - Create secret
- `updateSecret({ secretId, encryptedValue?, description?, encryptionKeyVersion?, tags? })` - Update secret
- `deleteSecret({ secretId })` - Soft delete secret
- `restoreSecret({ secretId })` - Restore deleted secret

### Access Logs (accessLog.ts)

**Queries:**
- `getResourceAccessLogs({ resourceType, resourceId, limit? })` - Get logs for specific resource
- `getUserAccessLogs({ limit? })` - Get current user's access logs

**Total:** 41 client-callable functions (18 queries, 23 mutations)

## Development Guidelines

### Comment Style
```typescript
// NOTE: lowercase description of what code does
const result = await someFunction();
```

### Permission Checks
Always check in this order:
1. Resource exists
2. Project not archived
3. Organization not suspended
4. Project not restricted
5. User has permission

### Error Messages
```typescript
throw new Error("Clear, user-friendly message");
```

### Type Safety
```typescript
// Good - explicit types
handler: async (ctx: ProtectedMutationCtx, args: { projectId: Id<"project"> }) => {

// Bad - implicit any
handler: async (ctx, args) => {
```

## Performance Optimizations

**Request-Level Caching**
- `isProjectAccessible()` cached per request
- `getUserProjectsWithRestrictions()` cached per request
- Cache cleared on plan changes
- Prevents redundant DB/Autumn calls

**Why Not Redis?**
- Request-level cache sufficient for current traffic
- No stale data issues
- Convex reactive updates remain instant
- Simple implementation without external dependencies

## Cron Jobs

**Daily 02:00 UTC** - `checkAllSubscriptionStatus`
- Syncs organization subscription status
- Handles grace period (7 days)
- Suspends orgs with lapsed payments

**Daily 03:00 UTC** - `checkAllUserPlanStatus`
- Detects plan upgrades/downgrades
- Sets/clears `planDowngradedAt` flag
- Enables grace period tracking
