import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  serviceAccount: defineTable({
    projectId: v.id("project"),
    name: v.string(),
    publicKey: v.string(),
    encryptedPrivateKey: v.string(),
    salt: v.string(),
    encryptedProjectKey: v.string(),
    hashedToken: v.string(),
    tokenPrefix: v.string(),
    createdBy: v.string(),
    oidcIssuer: v.optional(v.string()),
    oidcSubjectPattern: v.optional(v.string()),
    oidcAudience: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
    lastUsedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_project_revoked", ["projectId", "revokedAt"])
    .index("by_hashedToken", ["hashedToken"])
    .index("by_createdBy", ["createdBy"]),
  project: defineTable({
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    ownerId: v.string(),
    encryptedProjectKey: v.string(),
    keyVersion: v.number(),
    shareUsageCount: v.number(),
    isArchived: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_archived", ["ownerId", "isArchived"])
    .index("by_owner_slug", ["ownerId", "slug"]),
  projectShare: defineTable({
    projectId: v.id("project"),
    userId: v.string(),
    encryptedProjectKey: v.string(),
    sharedBy: v.string(),
    sharedAt: v.number(),
    revokedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_user", ["userId"])
    .index("by_user_active", ["userId", "revokedAt"])
    .index("by_project_user", ["projectId", "userId"])
    .index("by_project_user_active", ["projectId", "userId", "revokedAt"])
    .index("by_project_active", ["projectId", "revokedAt"]),
  environment: defineTable({
    projectId: v.id("project"),
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    color: v.optional(v.string()),
    sortOrder: v.number(),
    createdBy: v.string(),
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
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_environment", ["environmentId"])
    .index("by_environment_and_slug", ["environmentId", "slug"])
    .index("by_project", ["projectId"])
    .index("by_parent", ["parentFolderId"])
    .index("by_env_and_parent", ["environmentId", "parentFolderId"]),
  secret: defineTable({
    projectId: v.id("project"),
    environmentId: v.id("environment"),
    folderId: v.optional(v.id("folder")),
    key: v.string(),
    encryptedValue: v.string(),
    valueType: v.union(v.literal("string"), v.literal("number"), v.literal("boolean")),
    scope: v.union(v.literal("client"), v.literal("server"), v.literal("shared")),
    description: v.optional(v.string()),
    encryptionKeyVersion: v.number(),
    tags: v.optional(v.array(v.string())),
    isDeleted: v.boolean(),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedBy: v.string(),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_project_deleted", ["projectId", "isDeleted"])
    .index("by_environment", ["environmentId"])
    .index("by_environment_deleted", ["environmentId", "isDeleted"])
    .index("by_folder", ["folderId"])
    .index("by_env_and_key", ["environmentId", "key"])
    .index("by_env_folder_key", ["environmentId", "folderId", "key", "isDeleted"])
    .index("by_created_by", ["createdBy"])
    .index("by_updated_by", ["updatedBy"]),
  secretHistory: defineTable({
    secretId: v.id("secret"),
    projectId: v.id("project"),
    environmentId: v.id("environment"),
    folderId: v.optional(v.id("folder")),
    key: v.string(),
    version: v.number(),
    encryptedValue: v.string(),
    valueType: v.union(v.literal("string"), v.literal("number"), v.literal("boolean")),
    scope: v.union(v.literal("client"), v.literal("server"), v.literal("shared")),
    encryptionKeyVersion: v.number(),
    changeType: v.union(v.literal("updated"), v.literal("deleted"), v.literal("restored")),
    changedBy: v.string(),
    changedAt: v.number(),
  })
    .index("by_secret_version", ["secretId", "version"])
    .index("by_project", ["projectId"])
    .index("by_project_key_version", ["projectId", "encryptionKeyVersion"])
    .index("by_environment", ["environmentId"])
    .index("by_folder", ["folderId"]),
  keyRotation: defineTable({
    projectId: v.id("project"),
    oldKeyVersion: v.number(),
    newKeyVersion: v.number(),
    rotatedBy: v.string(),
    reason: v.optional(v.string()),
    secretsReEncrypted: v.number(),
    sharesUpdated: v.number(),
    historyReEncrypted: v.optional(v.number()),
    historyPurged: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_project", ["projectId"]),
  actionLog: defineTable({
    projectId: v.optional(v.id("project")),
    projectName: v.optional(v.string()),
    environmentId: v.optional(v.id("environment")),
    environmentName: v.optional(v.string()),
    userId: v.string(),
    action: v.union(
      v.literal("user.keys_created"),
      v.literal("user.password_changed"),
      v.literal("project.created"),
      v.literal("project.updated"),
      v.literal("project.archived"),
      v.literal("project.unarchived"),
      v.literal("project.key_rotated"),
      v.literal("secret.created"),
      v.literal("secret.updated"),
      v.literal("secret.deleted"),
      v.literal("secret.restored"),
      v.literal("secret.exported"),
      v.literal("secrets.bulk.updated"),
      v.literal("secrets.bulk_deleted"),
      v.literal("secrets.bulk_exported"),
      v.literal("secrets.pushed"),
      v.literal("environment.created"),
      v.literal("environment.updated"),
      v.literal("environment.deleted"),
      v.literal("folder.created"),
      v.literal("folder.updated"),
      v.literal("folder.deleted"),
      v.literal("share.added"),
      v.literal("share.revoked"),
      v.literal("share.key_updated"),
      v.literal("keys.rotated"),
      v.literal("apikey.created"),
      v.literal("apikey.revoked"),
      v.literal("account.deleted"),
      v.literal("onboarding.completed"),
      v.literal("serviceaccount.created"),
      v.literal("serviceaccount.revoked"),
      v.literal("serviceaccount.oidc_updated"),
    ),
    metadata: v.optional(
      v.object({
        secretId: v.optional(v.id("secret")),
        key: v.optional(v.string()),
        newKey: v.optional(v.string()),
        folderId: v.optional(v.id("folder")),
        folderName: v.optional(v.string()),
        environmentName: v.optional(v.string()),
        affectedValueCount: v.optional(v.number()),
        deleteCount: v.optional(v.number()),
        exportCount: v.optional(v.number()),
        exportFormat: v.optional(v.union(v.literal("relic"), v.literal("env"), v.literal("json"))),
        sharedUserId: v.optional(v.string()),
        sharedUserEmail: v.optional(v.string()),
        shareId: v.optional(v.id("projectShare")),
        reason: v.optional(v.string()),
        oldKeyVersion: v.optional(v.number()),
        newKeyVersion: v.optional(v.number()),
        keyRotated: v.optional(v.boolean()),
        secretsReEncrypted: v.optional(v.number()),
        sharesUpdated: v.optional(v.number()),
        historyReEncrypted: v.optional(v.number()),
        historyPurged: v.optional(v.number()),
        restoredVersion: v.optional(v.number()),
        wasDeleted: v.optional(v.boolean()),
        apiKeyPrefix: v.optional(v.string()),
        pushTarget: v.optional(v.string()),
        pushDestination: v.optional(v.string()),
        pushDryRun: v.optional(v.boolean()),
      }),
    ),
    timestamp: v.number(),
  })
    .index("by_project", ["projectId", "timestamp"])
    .index("by_environment", ["environmentId", "timestamp"])
    .index("by_user", ["userId", "timestamp"]),
  apiKey: defineTable({
    userId: v.string(),
    name: v.string(),
    hashedKey: v.string(),
    prefix: v.string(),
    scopes: v.array(v.string()),
    projectId: v.optional(v.id("project")),
    lastUsedAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_hashedKey", ["hashedKey"]),
  onboarding: defineTable({
    userId: v.string(),
    source: v.optional(
      v.union(
        v.literal("google_search"),
        v.literal("github"),
        v.literal("reddit"),
        v.literal("x"),
        v.literal("youtube"),
        v.literal("discord"),
        v.literal("friend"),
        v.literal("blog_post"),
        v.literal("other"),
      ),
    ),
    sourceOther: v.optional(v.string()),
    teamSize: v.optional(
      v.union(
        v.literal("1"),
        v.literal("2-5"),
        v.literal("6-20"),
        v.literal("21-50"),
        v.literal("50+"),
        v.literal("other"),
      ),
    ),
    createdAt: v.number(),
  }).index("by_user", ["userId"]),
  processedWebhook: defineTable({
    eventId: v.string(),
    // Keep "stripe" for historical rows written before billing webhooks moved to Autumn.
    source: v.union(v.literal("autumn"), v.literal("resend"), v.literal("stripe")),
    processedAt: v.number(),
  })
    .index("by_eventId_source", ["eventId", "source"])
    .index("by_processedAt", ["processedAt"]),
  billingSync: defineTable({
    userId: v.string(),
    dirty: v.boolean(),
    running: v.boolean(),
    attempts: v.number(),
    startedAt: v.optional(v.number()),
    lastSyncedAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
  }).index("by_user", ["userId"]),
  deletedAccount: defineTable({
    anonymousId: v.string(),
    deletedAt: v.number(),
    reason: v.union(v.literal("user_request"), v.literal("gdpr"), v.literal("admin")),
    hadProPlan: v.boolean(),
    projectsDeleted: v.number(),
    sharesRevoked: v.number(),
  }).index("by_anonymousId", ["anonymousId"]),
});
