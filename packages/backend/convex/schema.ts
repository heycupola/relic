import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
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
    primitiveType: v.union(v.literal("string"), v.literal("int64"), v.literal("boolean")),
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
  actionLog: defineTable({
    projectId: v.id("project"),
    userId: v.id("user"),
    action: v.union(
      v.literal("secret.created"),
      v.literal("secret.updated"),
      v.literal("secret.deleted"),
      v.literal("secret.exported"),
      v.literal("secrets.bulk.updated"),
      v.literal("secrets.bulk_deleted"),
      v.literal("secrets.bulk_exported"),
    ),
    metadata: v.optional(
      v.object({
        keyPath: v.optional(v.string()), // -> with folder: folder/ENV_NAME - without folder: ENV_NAME
        folderName: v.optional(v.string()), // -> if the folder is specifically exported, user this field as well
        affectedValueCount: v.optional(v.number()),
        deleteCount: v.optional(v.number()),
        exportCount: v.optional(v.number()),
        exportFormat: v.optional(v.union(v.literal("relic"), v.literal("env"), v.literal("json"))),
      }),
    ),
    timestamp: v.number(),
  })
    .index("by_project", ["projectId", "timestamp"])
    .index("by_user", ["userId", "timestamp"]),
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
});
