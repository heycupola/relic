# Relic Backend API Reference

Zero-knowledge secret management backend built with Convex.

## Table of Contents

- [Authentication](#authentication)
- [User Management](#user-management)
- [Projects](#projects)
- [Organizations](#organizations)
- [Environments](#environments)
- [Folders](#folders)
- [Secrets](#secrets)
- [User Keys](#user-keys)
- [Device Authentication](#device-authentication)
- [Action Logs](#action-logs)
- [Error Handling](#error-handling)

---

## Authentication

All endpoints require authentication via Better Auth. Protected endpoints automatically receive `ctx.userId` and `ctx.email`.

**Types of endpoints:**
- `protectedQuery` - Authenticated read operations
- `protectedMutation` - Authenticated write operations
- `protectedAction` - Authenticated actions (can call external services)

---

## User Management

### `getCurrentUser`
**Type:** `protectedQuery`

Get the currently authenticated user's information.

**Args:** None

**Returns:**
```typescript
{
  _id: Id<"user">,
  email: string,
  name: string | null,
  // ... other user fields
}
```

---

### `getProPlan`
**Type:** `protectedAction`

Initiate Pro plan checkout or check if user already has Pro plan.

**Args:** None

**Returns:**
```typescript
{
  success: boolean,
  hasPro: boolean,
  checkoutLink: string | null,
  sessionId: string | null
}
```

---

### `checkProPlan`
**Type:** `protectedAction`

Check if the current user has an active Pro plan.

**Args:** None

**Returns:**
```typescript
{
  success: boolean,
  hasProPlan: boolean
}
```

---

## Projects

### `createPersonalProject`
**Type:** `protectedAction`

Create a new personal project.

**Args:**
```typescript
{
  name: string
}
```

**Returns:**
```typescript
{
  success: boolean,
  project: {
    _id: Id<"project">,
    name: string,
    slug: string,
    ownerType: "user",
    ownerId: Id<"user">,
    // ...
  }
}
```

**Rate Limited:** Yes (write)

---

### `createOrganizationProject`
**Type:** `protectedAction`

Create a project within an organization.

**Args:**
```typescript
{
  organizationId: Id<"organization">,
  name: string
}
```

**Returns:**
```typescript
{
  success: boolean,
  project: { /* Project object */ }
}
```

**Rate Limited:** Yes (write)

---

### `listUserProjects`
**Type:** `protectedQuery`

List all personal projects for the current user.

**Args:** None

**Returns:**
```typescript
{
  projects: Array<{
    _id: Id<"project">,
    name: string,
    slug: string,
    isArchived: boolean,
    restricted: boolean,
    // ...
  }>,
  canCreateMore: boolean
}
```

---

### `listOrganizationProjects`
**Type:** `protectedQuery`

List all projects for a specific organization.

**Args:**
```typescript
{
  organizationId: Id<"organization">
}
```

**Returns:**
```typescript
{
  projects: Array</* Project objects */>,
  canCreateMore: boolean
}
```

---

### `getProject`
**Type:** `protectedQuery`

Get details of a specific project.

**Args:**
```typescript
{
  projectId: Id<"project">
}
```

**Returns:** Project object

---

### `updateProject`
**Type:** `protectedMutation`

Update project details.

**Args:**
```typescript
{
  projectId: Id<"project">,
  name: string
}
```

**Returns:**
```typescript
{
  success: boolean
}
```

**Rate Limited:** Yes (write)

---

### `archiveProject`
**Type:** `protectedAction`

Archive a project (only owner).

**Args:**
```typescript
{
  projectId: Id<"project">
}
```

**Returns:**
```typescript
{
  success: boolean
}
```

**Rate Limited:** Yes (write)

---

### `unarchiveProject`
**Type:** `protectedAction`

Unarchive a project (only owner).

**Args:**
```typescript
{
  projectId: Id<"project">
}
```

**Returns:**
```typescript
{
  success: boolean
}
```

**Rate Limited:** Yes (write)

---

## Organizations

### `createOrganization`
**Type:** `protectedAction`

Create a new organization (requires Pro plan or uses free org quota).

**Args:**
```typescript
{
  name: string
}
```

**Returns:**
```typescript
{
  success: boolean,
  organization: {
    _id: Id<"organization">,
    name: string,
    slug: string,
    ownerId: Id<"user">,
    // ...
  },
  orgMember: {
    /* Member object */
  }
}
```

**Rate Limited:** Yes (write)

---

### `inviteMember`
**Type:** `protectedAction`

Invite a user to an organization.

**Args:**
```typescript
{
  organizationId: Id<"organization">,
  email: string,
  role: "admin" | "member" | "viewer"
}
```

**Returns:**
```typescript
{
  success: boolean
}
```

**Rate Limited:** Yes (write, per-org)

---

### `removeMember`
**Type:** `protectedAction`

Remove a member from an organization.

**Args:**
```typescript
{
  organizationId: Id<"organization">,
  userId: Id<"user">
}
```

**Returns:**
```typescript
{
  success: boolean
}
```

**Rate Limited:** Yes (write, per-org)

---

### `leaveOrganization`
**Type:** `protectedAction`

Leave an organization (cannot leave if you're the owner).

**Args:**
```typescript
{
  organizationId: Id<"organization">
}
```

**Returns:**
```typescript
{
  success: boolean
}
```

**Rate Limited:** Yes (write, per-org)

---

### `listOrganizationMembers`
**Type:** `protectedQuery`

List all members of an organization.

**Args:**
```typescript
{
  organizationId: string
}
```

**Returns:** Array of member objects

**Rate Limited:** Yes (read)

---

### `loadOrganizationsByUserId`
**Type:** `protectedQuery`

Load all organizations for a user.

**Args:**
```typescript
{
  userId: Id<"user">
}
```

**Returns:** Array of organization objects

---

### `rotateKeys`
**Type:** `protectedMutation`

Rotate organization encryption keys (owner only).

**Args:**
```typescript
{
  organizationId: Id<"organization">,
  memberIds: Array<Id<"member">>,
  wrappedOrgKeys: Array<string>,
  reason: "member_removed" | "scheduled" | "manual"
}
```

**Returns:**
```typescript
{
  success: boolean
}
```

**Rate Limited:** Yes (keyRotation, per-org)

---

## Environments

### `createEnvironment`
**Type:** `protectedMutation`

Create a new environment within a project.

**Args:**
```typescript
{
  projectId: Id<"project">,
  name: string
}
```

**Returns:**
```typescript
{
  success: boolean,
  environment: { /* Environment object */ }
}
```

**Rate Limited:** Yes (write)

---

### `updateEnvironment`
**Type:** `protectedMutation`

Update an environment's name.

**Args:**
```typescript
{
  environmentId: Id<"environment">,
  name: string
}
```

**Returns:**
```typescript
{
  success: boolean
}
```

**Rate Limited:** Yes (write)

---

### `deleteEnvironment`
**Type:** `protectedMutation`

Delete an environment (must be empty).

**Args:**
```typescript
{
  environmentId: Id<"environment">
}
```

**Returns:**
```typescript
{
  success: boolean
}
```

**Rate Limited:** Yes (delete)

---

### `getEnvironmentData`
**Type:** `protectedQuery`

Get environment details with folders and secrets.

**Args:**
```typescript
{
  environmentId: Id<"environment">
}
```

**Returns:**
```typescript
{
  environment: { /* Environment object */ },
  folders: Array</* Folder objects */>,
  secrets: Array</* Secret objects */>,
  rootSecrets: Array</* Secret objects without folder */>,
  folderSecretsMap: Map</* folderId to secrets */>
}
```

---

## Folders

### `createFolder`
**Type:** `protectedMutation`

Create a folder in an environment.

**Args:**
```typescript
{
  environmentId: Id<"environment">,
  name: string
}
```

**Returns:**
```typescript
{
  success: boolean,
  folder: { /* Folder object */ }
}
```

**Rate Limited:** Yes (write)

---

### `updateFolder`
**Type:** `protectedMutation`

Update folder name.

**Args:**
```typescript
{
  folderId: Id<"folder">,
  name: string
}
```

**Returns:**
```typescript
{
  success: boolean
}
```

**Rate Limited:** Yes (write)

---

### `deleteFolder`
**Type:** `protectedMutation`

Delete a folder (must be empty).

**Args:**
```typescript
{
  folderId: Id<"folder">
}
```

**Returns:**
```typescript
{
  success: boolean
}
```

**Rate Limited:** Yes (delete)

---

## Secrets

### `createSecret`
**Type:** `protectedMutation`

Create a new encrypted secret.

**Args:**
```typescript
{
  environmentId: Id<"environment">,
  folderId?: Id<"folder">,
  key: string,
  encryptedValue: string,
  primitiveType: "string" | "number" | "boolean",
  encryptionKeyVersion: number
}
```

**Returns:**
```typescript
{
  success: boolean,
  secretId: Id<"secret">
}
```

**Rate Limited:** Yes (write)

---

### `getSecret`
**Type:** `protectedQuery`

Get a specific secret (encrypted value included).

**Args:**
```typescript
{
  secretId: Id<"secret">
}
```

**Returns:**
```typescript
{
  id: Id<"secret">,
  key: string,
  encryptedValue: string,
  primitiveType: "string" | "number" | "boolean",
  encryptionKeyVersion: number,
  // ...
}
```

---

### `updateSecret`
**Type:** `protectedMutation`

Update a secret's encrypted value or key.

**Args:**
```typescript
{
  secretId: Id<"secret">,
  updates: {
    key?: string,
    encryptedValue?: string,
    encryptionKeyVersion?: number,
    primitiveType: "string" | "number" | "boolean"
  }
}
```

**Returns:**
```typescript
{
  success: boolean
}
```

**Rate Limited:** Yes (write)

---

### `deleteSecret`
**Type:** `protectedMutation`

Soft-delete a secret.

**Args:**
```typescript
{
  secretId: Id<"secret">
}
```

**Returns:**
```typescript
{
  success: boolean
}
```

**Rate Limited:** Yes (delete)

---

### `reEncryptSecretsForPersonalProjectsBulk`
**Type:** `protectedMutation`

Re-encrypt multiple secrets (used when user changes master password).

**Args:**
```typescript
{
  secretIds: Array<Id<"secret">>,
  encryptedValues: Array<string>
}
```

**Returns:**
```typescript
{
  success: boolean,
  totalEncrypted: number
}
```

**Note:** Only works for personal project secrets owned by the user.

---

## User Keys

### `setKeysAndSalt`
**Type:** `protectedMutation`

Store user's encrypted RSA keys and password salt.

**Args:**
```typescript
{
  encryptedPrivateKey: string,
  publicKey: string,
  keySalt: string
}
```

**Returns:**
```typescript
{
  success: boolean
}
```

**Rate Limited:** Yes (write)

---

### `hasUserKeys`
**Type:** `protectedQuery`

Check if the user has keys stored.

**Args:** None

**Returns:**
```typescript
{
  hasKeys: boolean
}
```

---

### `loadPendingOrgKeyRewrapRequests`
**Type:** `protectedQuery`

Load pending organization key rewrap requests for the current user.

**Args:** None

**Returns:**
```typescript
{
  success: boolean,
  requests: Array</* Request objects */>
}
```

---

### `completeOrgKeyRewrapRequest`
**Type:** `protectedMutation`

Complete a key rewrap request (org owner only).

**Args:**
```typescript
{
  requestId: Id<"orgKeyRewrapRequest">,
  wrappedOrgKey: string
}
```

**Returns:**
```typescript
{
  success: boolean,
  requestId: Id<"orgKeyRewrapRequest">
}
```

**Rate Limited:** Yes (write)

---

### `cancelOrgKeyRewrapRequest`
**Type:** `protectedMutation`

Cancel a pending rewrap request.

**Args:**
```typescript
{
  requestId: Id<"orgKeyRewrapRequest">
}
```

**Returns:**
```typescript
{
  success: boolean,
  requestId: Id<"orgKeyRewrapRequest">
}
```

**Rate Limited:** Yes (write)

---

## Device Authentication

OAuth2 device flow for CLI authentication.

### `requestDeviceCode`
**Type:** `mutation` (public)

Request a device code for CLI authentication.

**Args:**
```typescript
{
  clientId?: string,
  scope?: string
}
```

**Returns:**
```typescript
{
  device_code: string,
  user_code: string,
  verification_uri: string,
  verification_uri_complete: string,
  expires_in: number,
  interval: number
}
```

**Rate Limited:** Yes (write, custom key)

---

### `pollDeviceToken`
**Type:** `mutation` (public)

Poll for device token (CLI checks if user approved).

**Args:**
```typescript
{
  device_code: string
}
```

**Returns:**
```typescript
{
  session_token: string,
  token_type: "Bearer",
  expires_in: number
}
```

**Errors:**
- `AUTHORIZATION_PENDING` - User hasn't approved yet
- `SLOW_DOWN` - Polling too fast
- `EXPIRED_TOKEN` - Code expired
- `ACCESS_DENIED` - User denied

**Rate Limited:** Yes (write, per device_code)

---

### `getDeviceCodeInfo`
**Type:** `query` (public)

Get information about a device code (for web UI).

**Args:**
```typescript
{
  user_code: string
}
```

**Returns:**
```typescript
{
  userCode: string,
  clientId?: string,
  scope?: string,
  status: "pending" | "approved" | "denied"
}
```

**Rate Limited:** Yes (read)

---

### `approveDeviceCode`
**Type:** `protectedMutation`

Approve a device code (user action in web UI).

**Args:**
```typescript
{
  user_code: string
}
```

**Returns:**
```typescript
{
  success: boolean
}
```

**Rate Limited:** Yes (write)

---

### `denyDeviceCode`
**Type:** `protectedMutation`

Deny a device code.

**Args:**
```typescript
{
  user_code: string
}
```

**Returns:**
```typescript
{
  success: boolean
}
```

**Rate Limited:** Yes (write)

---

## Action Logs

Audit trail for secret operations.

### `loadActionLogsByProject`
**Type:** `protectedAction`

Load paginated action logs for a project.

**Args:**
```typescript
{
  projectId: Id<"project">,
  paginationOpts: PaginationOptions
}
```

**Returns:** `PaginationResult<Doc<"actionLog">>`

**Rate Limited:** Yes (read)

---

### `loadActionLogsByEnvironment`
**Type:** `protectedAction`

Load paginated action logs for an environment.

**Args:**
```typescript
{
  environmentId: Id<"environment">,
  paginationOpts: PaginationOptions
}
```

**Returns:** `PaginationResult<Doc<"actionLog">>`

**Rate Limited:** Yes (read)

---

## Error Handling

All errors are returned as `ConvexError` with the following structure:

```typescript
{
  code: string,        // Error code (see lib/errors.ts)
  message: string,     // Human-readable message
  severity: "low" | "medium" | "high"
}
```

### Common Error Codes

**Authentication:**
- `UNAUTHORIZED` - User not signed in
- `INSUFFICIENT_PERMISSION` - User doesn't have permission
- `INSUFFICIENT_ROLE` - Role doesn't allow action

**Resource Not Found:**
- `USER_NOT_FOUND`
- `ORGANIZATION_NOT_FOUND`
- `PROJECT_NOT_FOUND`
- `ENVIRONMENT_NOT_FOUND`
- `FOLDER_NOT_FOUND`
- `SECRET_NOT_FOUND`

**Limits:**
- `RATE_LIMIT_EXCEEDED`
- `PERSONAL_PROJECTS_LIMIT_REACHED`
- `ORGANIZATION_PROJECTS_LIMIT_REACHED`
- `ENVIRONMENT_LIMIT_REACHED`
- `MEMBER_LIMIT_REACHED`

**Conflicts:**
- `RESOURCE_ALREADY_EXISTS`
- `DUPLICATE_SLUG`
- `INVITATION_ALREADY_PENDING`

See `lib/errors.ts` for the complete list and helper functions.

---

## Rate Limiting

Rate limits are applied per-user across all endpoints:

- **Read operations:** Lower limit (frequent queries allowed)
- **Write operations:** Standard limit
- **Delete operations:** Same as write
- **Key rotation:** Stricter limit (security-sensitive)

Rate limits are tracked using a token bucket algorithm with per-endpoint and per-resource limits.

---

## Best Practices

1. **Always handle errors** - All endpoints can throw `ConvexError`
2. **Check permissions** - Access control is enforced at every layer
3. **Respect rate limits** - Use exponential backoff on `RATE_LIMIT_EXCEEDED`
4. **Validate input** - Frontend should validate before calling backend
5. **Use bulk operations** - For re-encryption, use bulk endpoints
6. **Poll responsibly** - Device auth polling should respect `interval` field

---

## Architecture

- **Zero-knowledge:** All secrets encrypted client-side
- **End-to-end encrypted:** Private keys never leave client
- **Multi-tenancy:** Personal and organization projects
- **Subscription-based:** Autumn billing integration
- **Audit logging:** All secret operations logged

For implementation details, see `CLAUDE.md`.
