import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  userKeys: defineTable({
    userId: v.id("users"),
    publicKey: v.string(),
    encryptedPrivateKey: v.string(), // NOTE: this is encrypted with user's master key
    salt: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),
  organizations: defineTable({
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    billingUserId: v.id("users"),
    billingEmail: v.string(),
    isFreeWithProPlan: v.boolean(),
    autumnCustomerId: v.string(),
    currentKeyVersion: v.number(),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_creator", ["createdBy"])
    .index("by_billing_user", ["billingUserId"]),
  organizationMembers: defineTable({
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    role: v.union(v.literal("owner"), v.literal("admin"), v.literal("member"), v.literal("viewer")),
    wrappedOrgKey: v.string(),
    keyVersion: v.number(),
    grantedBy: v.id("users"),
    grantedAt: v.number(),
    revokedAt: v.optional(v.number()),
    revokedBy: v.optional(v.id("users")),
    revocationReason: v.optional(v.union(v.literal("left"), v.literal("removed"))),
  })
    .index("by_organization", ["organizationId"])
    .index("by_user", ["userId"])
    .index("by_org_and_user", ["organizationId", "userId"])
    .index("by_org_active", ["organizationId", "revokedAt"]),
  projects: defineTable({
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    ownerType: v.union(v.literal("user"), v.literal("organization")),
    ownerId: v.string(),
    isArchived: v.boolean(),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerType", "ownerId"])
    .index("by_creator", ["createdBy"]),
  environments: defineTable({
    projectId: v.id("projects"),
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    color: v.optional(v.string()),
    sortOrder: v.number(),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_project_and_slug", ["projectId", "slug"]),
  folders: defineTable({
    environmentId: v.id("environments"),
    projectId: v.id("projects"),
    name: v.string(),
    slug: v.string(),
    path: v.string(),
    description: v.optional(v.string()),
    parentFolderId: v.optional(v.id("folders")),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_environment", ["environmentId"])
    .index("by_project", ["projectId"])
    .index("by_parent", ["parentFolderId"])
    .index("by_env_and_parent", ["environmentId", "parentFolderId"]),
  secrets: defineTable({
    projectId: v.id("projects"),
    environmentId: v.id("environments"),
    folderId: v.optional(v.id("folders")),
    key: v.string(),
    encryptedValue: v.string(),
    description: v.optional(v.string()),
    encryptionKeyVersion: v.number(),
    tags: v.optional(v.array(v.string())),
    isDeleted: v.boolean(),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedBy: v.id("users"),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_environment", ["environmentId"])
    .index("by_folder", ["folderId"])
    .index("by_env_and_key", ["environmentId", "key"]),
  secretHistories: defineTable({
    secretId: v.id("secrets"),
    projectId: v.id("projects"),
    environmentId: v.id("environments"),
    key: v.string(),
    encryptedValue: v.string(),
    description: v.optional(v.string()),
    encryptionKeyVersion: v.number(),
    action: v.union(
      v.literal("created"),
      v.literal("updated"),
      v.literal("deleted"),
      v.literal("restored"),
    ),
    changedBy: v.id("users"),
    changedAt: v.number(),
  })
    .index("by_secret", ["secretId"])
    .index("by_project", ["projectId"])
    .index("by_timestamp", ["changedAt"]),
  accessLogs: defineTable({
    userId: v.id("users"),
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
  keyRotations: defineTable({
    organizationId: v.id("organizations"),
    oldKeyVersion: v.number(),
    newKeyVersion: v.number(),
    secretsReEncrypted: v.number(),
    membersRewrapped: v.number(),
    reason: v.optional(v.string()), // NOTE: it can be "member_removed", "scheduled", "manual"
    rotatedBy: v.id("users"),
    rotatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_timestamp", ["rotatedAt"]),
});
