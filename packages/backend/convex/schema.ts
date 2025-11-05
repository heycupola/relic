import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  user: defineTable({
    authId: v.string(),
    email: v.string(),
    name: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    freeOrganizationUsed: v.boolean(),
    planDowngradedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_auth_id", ["authId"])
    .index("by_email", ["email"]),
  userKey: defineTable({
    userId: v.id("user"),
    publicKey: v.string(),
    encryptedPrivateKey: v.string(),
    salt: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),
  organizationSetting: defineTable({
    organizationId: v.string(),
    isFreeWithProPlan: v.boolean(),
    currentKeyVersion: v.number(),
    subscriptionStatus: v.union(
      v.literal("active"),
      v.literal("payment_lapsed"),
      v.literal("suspended"),
    ),
    paymentLapsedAt: v.optional(v.number()),
    suspendedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_status", ["subscriptionStatus"]),
  organizationMember: defineTable({
    organizationId: v.string(),
    userId: v.id("user"),
    role: v.union(v.literal("owner"), v.literal("admin"), v.literal("member"), v.literal("viewer")),
    wrappedOrgKey: v.string(),
    keyVersion: v.number(),
    grantedBy: v.id("user"),
    grantedAt: v.number(),
    revokedAt: v.optional(v.number()),
    revokedBy: v.optional(v.id("user")),
    revocationReason: v.optional(v.union(v.literal("left"), v.literal("removed"))),
  })
    .index("by_organization", ["organizationId"])
    .index("by_user", ["userId"])
    .index("by_org_and_user", ["organizationId", "userId"])
    .index("by_org_active", ["organizationId", "revokedAt"]),
  project: defineTable({
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    ownerType: v.union(v.literal("user"), v.literal("organization")),
    ownerId: v.string(),
    isArchived: v.boolean(),
    createdBy: v.id("user"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerType", "ownerId"])
    .index("by_creator", ["createdBy"]),
  environment: defineTable({
    projectId: v.id("project"),
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    color: v.optional(v.string()),
    sortOrder: v.number(),
    createdBy: v.id("user"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_project_and_slug", ["projectId", "slug"]),
  folder: defineTable({
    environmentId: v.id("environment"),
    projectId: v.id("project"),
    name: v.string(),
    slug: v.string(),
    path: v.string(),
    description: v.optional(v.string()),
    parentFolderId: v.optional(v.id("folder")),
    createdBy: v.id("user"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_environment", ["environmentId"])
    .index("by_project", ["projectId"])
    .index("by_parent", ["parentFolderId"])
    .index("by_env_and_parent", ["environmentId", "parentFolderId"]),
  secret: defineTable({
    projectId: v.id("project"),
    environmentId: v.id("environment"),
    folderId: v.optional(v.id("folder")),
    key: v.string(),
    encryptedValue: v.string(),
    primitiveType: v.union(
      v.literal("string"),
      v.literal("int64"),
      v.literal("boolean"),
      // NOTE: planned primitive types for the next versions
      // v.literal("int32"),
      // v.literal("uint32"),
      // v.literal("uint64"),
      // v.literal("float32"),
      // v.literal("float64"),
      // v.literal("json"),
      // v.literal("array"),
      // v.literal("bytes")
    ),
    // NOTE: planned semantic types for the next versions
    // semanticType: v.union(
    // v.literal("generic"),
    // v.literal("api_key"),
    // v.literal("token"),
    // v.literal("database_url"),
    // v.literal("url"),
    // v.literal("email"),
    // v.literal("password"),
    // v.literal("secret_key"),
    // v.literal("private_key"),
    // v.literal("redis_url"),
    // v.literal("phone"),
    // v.literal("ipv4"),
    // v.literal("ipv6"),
    // ),
    description: v.optional(v.string()),
    encryptionKeyVersion: v.number(),
    tags: v.optional(v.array(v.string())),
    isDeleted: v.boolean(),
    createdBy: v.id("user"),
    createdAt: v.number(),
    updatedBy: v.id("user"),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_environment", ["environmentId"])
    .index("by_folder", ["folderId"])
    .index("by_env_and_key", ["environmentId", "key"])
    .index("by_created_by", ["createdBy"])
    .index("by_updated_by", ["updatedBy"]),
  secretHistory: defineTable({
    secretId: v.id("secret"),
    projectId: v.id("project"),
    environmentId: v.id("environment"),
    key: v.string(),
    encryptedValue: v.string(),
    primitiveType: v.union(v.literal("string"), v.literal("int64"), v.literal("boolean")),
    description: v.optional(v.string()),
    encryptionKeyVersion: v.number(),
    action: v.union(
      v.literal("created"),
      v.literal("updated"),
      v.literal("deleted"),
      v.literal("restored"),
    ),
    changedBy: v.id("user"),
    changedAt: v.number(),
  })
    .index("by_secret", ["secretId"])
    .index("by_project", ["projectId"])
    .index("by_timestamp", ["changedAt"])
    .index("by_changed_by", ["changedBy"]),
  accessLog: defineTable({
    userId: v.id("user"),
    resourceType: v.union(
      v.literal("secret"),
      v.literal("project"),
      v.literal("environment"),
      v.literal("organization"),
    ),
    resourceId: v.string(),
    action: v.union(
      v.literal("viewed"),
      v.literal("created"),
      v.literal("updated"),
      v.literal("deleted"),
      v.literal("exported"),
    ),
    ipAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    timestamp: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_resource", ["resourceType", "resourceId"])
    .index("by_timestamp", ["timestamp"]),
  keyRotation: defineTable({
    organizationId: v.string(),
    oldKeyVersion: v.number(),
    newKeyVersion: v.number(),
    secretsReEncrypted: v.number(),
    membersRewrapped: v.number(),
    reason: v.optional(v.string()),
    rotatedBy: v.id("user"),
    rotatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_timestamp", ["rotatedAt"])
    .index("by_rotated_by", ["rotatedBy"]),
  deviceCode: defineTable({
    deviceCode: v.string(),
    userCode: v.string(),
    userId: v.optional(v.id("user")),
    clientId: v.optional(v.string()),
    scope: v.optional(v.string()),
    status: v.union(v.literal("pending"), v.literal("approved"), v.literal("denied")),
    expiresAt: v.number(),
    pollingInterval: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_device_code", ["deviceCode"])
    .index("by_user_code", ["userCode"])
    .index("by_user", ["userId"])
    .index("by_status", ["status"])
    .index("by_expires", ["expiresAt"]),
});
