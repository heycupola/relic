# Relic Backend - Convex API

Zero-knowledge encrypted secret management backend built with Convex, Better-Auth, and Autumn billing.

## Overview

Relic is a secure secret management platform where all encryption happens **client-side**. The backend only stores encrypted data and manages access control, billing, and audit logs.

**Key Features:**
- Zero-knowledge encryption (RSA client-side)
- Role-based access control (owner/admin/member/viewer)
- Personal and organization projects
- Multi-environment secret management
- Key rotation and secret versioning
- Audit logging
- Autumn-powered billing integration

## Tech Stack

- **Convex** - Real-time database and backend
- **Better-Auth** - Authentication system
- **Autumn** - Subscription and usage billing
- **TypeScript** - Type-safe development
- **Bun** - Fast JavaScript runtime

## Setup

Install dependencies:
```bash
bun install
```

Run development server:
```bash
bun run dev
```

## Database Schema

### Core Tables

#### `user`
Internal user records synced from Better-Auth.
- `authId` - Better-Auth user ID
- `email` - User email address
- `name` - Display name (optional)
- `avatarUrl` - Profile picture URL (optional)
- `createdAt`, `updatedAt` - Timestamps

#### `userKey`
User's RSA encryption keys (encrypted private key stored).
- `userId` - User reference
- `publicKey` - RSA public key (PEM format)
- `encryptedPrivateKey` - Private key encrypted with user's password
- `salt` - Salt for key derivation
- `createdAt`, `updatedAt` - Timestamps

### Organization Tables

#### `organizationSetting`
Organization configuration and billing.
- `organizationId` - Organization ID (string identifier)
- `billingUserId` - User who owns billing
- `isFreeWithProPlan` - Free org included with Pro plan
- `autumnCustomerId` - Autumn billing customer ID
- `currentKeyVersion` - Current encryption key version
- `createdAt`, `updatedAt` - Timestamps

#### `organizationMember`
Organization membership and wrapped keys.
- `organizationId` - Organization reference
- `userId` - User reference
- `role` - owner | admin | member | viewer
- `wrappedOrgKey` - Organization key wrapped with user's public key
- `keyVersion` - Version of org key this member has
- `grantedBy` - User who added this member
- `grantedAt` - When membership was granted
- `revokedAt`, `revokedBy`, `revocationReason` - Revocation details (optional)

### Project Tables

#### `project`
Projects contain environments and secrets.
- `name` - Project name
- `slug` - URL-safe identifier
- `description` - Optional description
- `ownerType` - user | organization
- `ownerId` - User ID or organization ID
- `isArchived` - Soft delete flag
- `createdBy` - Creator user reference
- `createdAt`, `updatedAt` - Timestamps

#### `environment`
Environments within projects (dev, staging, prod, etc.).
- `projectId` - Parent project
- `name` - Environment name
- `slug` - URL-safe identifier
- `description`, `color` - Optional metadata
- `sortOrder` - Display order
- `createdBy` - Creator user reference
- `createdAt`, `updatedAt` - Timestamps

#### `folder`
Folders to organize secrets (simplified: root-level only for MVP).
- `environmentId` - Parent environment
- `projectId` - Parent project (denormalized)
- `name` - Folder name
- `slug` - URL-safe identifier
- `path` - Full path (e.g., `/folder-name`)
- `description` - Optional description
- `parentFolderId` - Parent folder (reserved for future nested support)
- `createdBy` - Creator user reference
- `createdAt`, `updatedAt` - Timestamps

### Secret Tables

#### `secret`
Encrypted secrets (zero-knowledge stored).
- `projectId` - Parent project (denormalized)
- `environmentId` - Parent environment
- `folderId` - Parent folder (optional)
- `key` - Secret name/identifier
- `encryptedValue` - Encrypted secret value (client-side encrypted)
- `description` - Optional description
- `encryptionKeyVersion` - Key version used for encryption
- `tags` - Optional tags for organization
- `isDeleted` - Soft delete flag
- `createdBy`, `updatedBy` - User references
- `createdAt`, `updatedAt` - Timestamps

#### `secretHistory`
Audit trail of secret changes.
- `secretId` - Secret reference
- `projectId`, `environmentId` - Parent references
- `key` - Secret name at time of change
- `encryptedValue` - Encrypted value at time of change
- `description` - Description at time of change
- `encryptionKeyVersion` - Key version used
- `action` - created | updated | deleted | restored
- `changedBy` - User who made the change
- `changedAt` - Timestamp of change

### Audit Tables

#### `accessLog`
Security audit trail of all access.
- `userId` - User who performed action
- `resourceType` - secret | project | environment | organization
- `resourceId` - ID of resource accessed
- `action` - viewed | created | updated | deleted | exported
- `ipAddress`, `userAgent` - Request metadata (optional)
- `timestamp` - When action occurred

#### `keyRotation`
Organization key rotation history.
- `organizationId` - Organization reference
- `oldKeyVersion`, `newKeyVersion` - Version change
- `secretsReEncrypted` - Count of secrets re-encrypted
- `membersRewrapped` - Count of member keys rewrapped
- `reason` - member_removed | scheduled | manual (optional)
- `rotatedBy` - User who initiated rotation
- `rotatedAt` - Timestamp of rotation

---

## API Handlers

### Authentication & Users

#### `user.ts`

**Public Handlers:**
- `syncUserFromAuth` (internal) - Syncs user from Better-Auth to internal user table
- `getUserByAuthId` (internal) - Looks up user by auth ID

**Protected Handlers:**
- `getCurrentUser()` - Get authenticated user's profile
- `getUser({ userId })` - Get another user's public profile
- `getUsersByIds({ userIds })` - Batch get users by IDs
- `updateUserProfile({ name?, avatarUrl? })` - Update user's profile
- `searchUsersByEmail({ email, limit? })` - Search users by email

#### `userKey.ts`

**Protected Handlers:**
- `storeUserKey({ publicKey, encryptedPrivateKey, salt })` - Store user's encryption keys (one-time)
- `getUserKey()` - Get user's encryption keys
- `hasUserKeys()` - Check if user has keys set up
- `updateUserKey({ publicKey, encryptedPrivateKey, salt })` - Rotate user's encryption keys

---

### Organizations

#### `organization.ts`

**Protected Handlers:**
- `initializeOrganization({ organizationId, wrapperOrgKey })` - Initialize org (requires Pro plan)
- `addMember({ organizationId, userEmail, role, wrappedOrgKey })` - Add member to org (owner/admin only)
- `removeMember({ organizationId, userId, reason })` - Remove member (owner/admin only, triggers key rotation warning)
- `listMembers({ organizationId })` - List org members
- `getUserOrganizations()` - Get user's org memberships
- `getOrganizationSettings({ organizationId })` - Get org settings and key status
- `rotateOrganizationKeys({ organizationId, newKeyVersion, secrets, members, reason? })` - Rotate org encryption keys (owner only)

---

### Projects

#### `project.ts`

**Protected Handlers:**
- `createPersonalProject({ name, slug, description? })` - Create personal project (checks billing limits)
- `createOrganizationProject({ organizationId, name, slug, description? })` - Create org project (owner/admin only)
- `listUserProjects()` - List user's personal projects
- `listOrganizationProjects({ organizationId })` - List org's projects
- `getProject({ projectId })` - Get project details
- `updateProject({ projectId, name?, description? })` - Update project (admin+ only)
- `archiveProject({ projectId })` - Archive project (owner only)

---

### Environments

#### `environment.ts`

**Protected Handlers:**
- `createEnvironment({ projectId, name, slug, description?, color? })` - Create environment (member+ only)
- `listEnvironments({ projectId })` - List project's environments
- `getEnvironment({ environmentId })` - Get environment details
- `updateEnvironment({ environmentId, name?, description?, color?, sortOrder? })` - Update environment (admin+ only)
- `deleteEnvironment({ environmentId })` - Delete environment (owner only, must be empty)
- `reorderEnvironments({ projectId, environmentIds })` - Reorder environments (admin+ only)

---

### Folders

#### `folder.ts`

**Protected Handlers:**
- `createFolder({ environmentId, name, slug, description? })` - Create folder (member+ only)
- `listFolders({ environmentId })` - List environment's folders
- `getFolder({ folderId })` - Get folder details
- `updateFolder({ folderId, name?, description? })` - Update folder (member+ only)
- `deleteFolder({ folderId })` - Delete folder (admin+ only, must be empty)

---

### Secrets

#### `secret.ts`

**Protected Handlers:**
- `createSecret({ environmentId, folderId?, key, encryptedValue, description?, encryptionKeyVersion, tags? })` - Create secret (member+ only)
- `listSecrets({ environmentId, folderId?, includeDeleted? })` - List secrets (viewer+ can see)
- `getSecret({ secretId })` - Get secret with encrypted value (viewer+ can see)
- `updateSecret({ secretId, encryptedValue?, description?, encryptionKeyVersion?, tags? })` - Update secret (member+ only)
- `deleteSecret({ secretId })` - Soft delete secret (member+ only)
- `restoreSecret({ secretId })` - Restore deleted secret (member+ only)
- `listSecretHistory({ secretId })` - Get secret audit history (viewer+ can see, limited to 100 entries)

---

### Access Logs

#### `accessLog.ts`

**Protected Handlers:**
- `getAccessLogs({ resourceType?, resourceId?, limit? })` - Get filtered access logs (default 100)
- `getResourceAccessLogs({ resourceType, resourceId, limit? })` - Get logs for specific resource (default 50)
- `getUserAccessLogs({ limit? })` - Get current user's access logs (default 100)

**Internal Helper:**
- `logAccess(ctx, resourceType, resourceId, action, metadata?)` - Helper to log access (used internally)

---

## Access Control

### Roles & Permissions

**Organization Roles:**
- **owner** - Full control, billing, key rotation, member management
- **admin** - Project management, member management (except owner removal)
- **member** - Create/update secrets, environments
- **viewer** - Read-only access to secrets and projects

**Project Ownership:**
- Personal projects: Only the creator has access
- Organization projects: Access based on organization role

### Access Helpers (`lib/access.ts`)

- `hasProjectAccess(ctx, project)` - Check if user can view project
- `canWriteProject(ctx, project)` - Check if user can create/update (excludes viewers)
- `canAdminProject(ctx, project)` - Check if user can manage project (owner/admin only)
- `isProjectOwner(ctx, project)` - Check if user is project owner

---

## Billing Integration (Autumn)

### Features Tracked

**User Features:**
- `personal_projects` - Personal project count (Free: 2, Pro: 10)
- `can_create_org` - Ability to create organizations (Pro only)

**Organization Features:**
- `organization_projects` - Org project count (10 per org subscription)
- `members` - Org member count (5 included, can purchase more seats)

### Usage Tracking

Automatically tracks usage on:
- Project creation/archival
- Organization member add/remove
- Checks limits before allowing operations

---

## Security Architecture

### Zero-Knowledge Encryption

1. **User Keys**:
   - RSA key pair generated client-side
   - Private key encrypted with user's password (never sent to server)
   - Public key stored for other users to wrap organization keys

2. **Organization Keys**:
   - Symmetric key generated client-side for each org
   - Wrapped with each member's public key (RSA)
   - Each member can unwrap org key with their private key

3. **Secret Encryption**:
   - Secrets encrypted client-side with organization key (or user key for personal projects)
   - Only encrypted values stored on server
   - Server has zero knowledge of plaintext

### Key Rotation

When a member is removed from an organization:
1. Generate new organization key
2. Re-encrypt all secrets with new key
3. Rewrap new key for remaining members
4. Increment key version
5. Log rotation in `keyRotation` table

---

## Roadmap to Production

### MVP Completion

- [x] Core schema and database design
- [x] User authentication and key management
- [x] Organization management with roles
- [x] Project and environment CRUD
- [x] Secret management with encryption
- [x] Access control and permissions
- [x] Audit logging
- [x] Billing integration (Autumn)
- [x] TypeScript type safety

### Production Readiness Enhancements

#### 1. Rate Limiting & DDoS Protection
- [ ] Implement rate limiting per user/IP using Convex rate limits
- [ ] Add request throttling for expensive operations (key rotation, bulk secret creation)
- [ ] Add CAPTCHA for sensitive operations
- [ ] Implement exponential backoff for failed auth attempts

#### 2. Enhanced Security
- [ ] Add IP allowlisting/blocklisting at organization level
- [ ] Implement 2FA/MFA requirement enforcement
- [ ] Add session management and device tracking
- [ ] Implement anomaly detection for access patterns
- [ ] Add webhook signatures for API callbacks
- [ ] Implement content security policies
- [ ] Add request signing for API calls

#### 3. Monitoring & Observability
- [ ] Set up error tracking (Sentry/Rollbar)
- [ ] Add performance monitoring and APM
- [ ] Create dashboards for key metrics (secret count, access patterns, errors)
- [ ] Set up alerting for suspicious activity
- [ ] Add audit log export functionality
- [ ] Implement log retention policies

#### 4. Data Management
- [ ] Add bulk secret import/export
- [ ] Implement secret templates
- [ ] Add automatic secret rotation scheduling
- [ ] Implement backup and disaster recovery
- [ ] Add data retention and cleanup policies
- [ ] Support for secret versioning and rollback

#### 5. Performance Optimization
- [ ] Add caching layer for frequently accessed secrets
- [ ] Implement pagination for large lists
- [ ] Optimize database indexes for common queries
- [ ] Add database query performance monitoring
- [ ] Implement lazy loading for large datasets

#### 6. API Enhancements
- [ ] Add GraphQL API layer
- [ ] Implement webhook system for secret changes
- [ ] Add API versioning
- [ ] Create SDK for popular languages (JS, Python, Go)
- [ ] Add CLI tool for secret management
- [ ] Implement CI/CD integration plugins

#### 7. Collaboration Features
- [ ] Add secret sharing links with expiration
- [ ] Implement approval workflows for sensitive operations
- [ ] Add comments/annotations on secrets
- [ ] Create activity feed for teams
- [ ] Add @mentions and notifications
- [ ] Implement secret change requests/reviews

#### 8. Advanced Features
- [ ] Nested folder support (currently root-level only)
- [ ] Secret references and linking
- [ ] Environment variable generation
- [ ] Integration with cloud providers (AWS, GCP, Azure)
- [ ] Secret scanning in repositories
- [ ] Compliance reporting (SOC 2, ISO 27001)

#### 9. Testing & Quality
- [ ] Add comprehensive unit tests (target 80%+ coverage)
- [ ] Add integration tests for critical flows
- [ ] Add end-to-end tests for user journeys
- [ ] Implement chaos engineering tests
- [ ] Add load testing and benchmarking
- [ ] Set up continuous security scanning

#### 10. Documentation
- [ ] Create API documentation (OpenAPI/Swagger)
- [ ] Write user guides and tutorials
- [ ] Create video tutorials
- [ ] Add migration guides
- [ ] Create security best practices guide
- [ ] Write contributor guidelines

### Infrastructure Considerations

#### Scalability
- [ ] Implement database sharding strategy
- [ ] Add read replicas for queries
- [ ] Set up CDN for static assets
- [ ] Implement multi-region deployment
- [ ] Add load balancing

#### Compliance & Legal
- [ ] GDPR compliance (data export, right to deletion)
- [ ] CCPA compliance
- [ ] SOC 2 Type II certification prep
- [ ] Privacy policy and terms of service
- [ ] Data processing agreements

#### Business Features
- [ ] Enterprise SSO (SAML, OIDC)
- [ ] Custom branding for organizations
- [ ] Advanced billing features (invoicing, quotes)
- [ ] Usage analytics and reporting
- [ ] Audit log retention policies per plan tier

---

## Development Guidelines

### Code Organization

```
convex/
├── schema.ts              # Database schema
├── auth.ts                # Better-Auth configuration
├── autumn.ts              # Autumn billing setup
├── lib/
│   ├── middleware.ts      # Auth middleware
│   ├── types.ts          # Shared TypeScript types
│   ├── access.ts         # Access control helpers
│   └── accessLog.ts      # Audit logging helper
├── user.ts               # User management
├── userKey.ts            # User encryption keys
├── organization.ts       # Organization management
├── project.ts            # Project CRUD
├── environment.ts        # Environment CRUD
├── folder.ts             # Folder CRUD
├── secret.ts             # Secret management
└── accessLog.ts          # Access log queries
```

### Type Safety

All handlers use explicit TypeScript types:
- Context types: `ProtectedQueryCtx`, `ProtectedMutationCtx`
- All handler args are explicitly typed
- Use `Id<"table">` for all ID references

### Best Practices

1. **Always check permissions** before allowing operations
2. **Log sensitive operations** to access logs
3. **Track billing usage** when creating/deleting resources
4. **Use soft deletes** (`isDeleted` flag) for important data
5. **Validate input** at handler boundaries
6. **Return minimal data** - don't expose sensitive fields unnecessarily
7. **Use transactions** for multi-step operations (via Convex's atomic operations)

