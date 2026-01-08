import type { PaginationResult } from "convex/server";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import { assertProjectAccess } from "./lib/access";
import { protectedAction } from "./lib/middleware";
import { checkRateLimit } from "./lib/rateLimit";
import type { ProtectedActionCtx } from "./lib/types";

export const _insertActionLog = internalMutation({
  args: {
    projectId: v.optional(v.id("project")),
    userId: v.string(),
    action: v.union(
      v.literal("user.keys_created"),
      v.literal("user.password_changed"),
      v.literal("project.key_rotated"),
      v.literal("secret.created"),
      v.literal("secret.updated"),
      v.literal("secret.deleted"),
      v.literal("secret.exported"),
      v.literal("secrets.bulk.updated"),
      v.literal("secrets.bulk_deleted"),
      v.literal("secrets.bulk_exported"),
      v.literal("share.added"),
      v.literal("share.revoked"),
      v.literal("share.key_updated"),
      v.literal("keys.rotated"),
    ),
    environmentId: v.optional(v.id("environment")),
    environmentName: v.optional(v.string()),
    metadata: v.optional(
      v.object({
        folderId: v.optional(v.id("folder")),
        folderName: v.optional(v.string()),
        secretId: v.optional(v.id("secret")),
        key: v.optional(v.string()),
        newKey: v.optional(v.string()),
        exportFormat: v.optional(v.union(v.literal("relic"), v.literal("env"), v.literal("json"))),
        exportCount: v.optional(v.number()),
        affectedValueCount: v.optional(v.number()),
        deleteCount: v.optional(v.number()),
        sharedUserId: v.optional(v.string()),
        sharedUserEmail: v.optional(v.string()),
        shareId: v.optional(v.id("projectShare")),
        reason: v.optional(v.string()),
        oldKeyVersion: v.optional(v.number()),
        newKeyVersion: v.optional(v.number()),
        keyRotated: v.optional(v.boolean()),
        secretsReEncrypted: v.optional(v.number()),
        sharesUpdated: v.optional(v.number()),
      }),
    ),
  },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args) => {
    let project: Doc<"project"> | null | undefined;
    if (args.projectId) {
      project = await ctx.db.get(args.projectId);
    }

    await ctx.db.insert("actionLog", {
      action: args.action,
      projectId: args.projectId,
      projectName: project?.name,
      environmentId: args.environmentId,
      environmentName: args.environmentName,
      timestamp: Date.now(),
      userId: args.userId,
      metadata: args.metadata,
    });

    return { success: true };
  },
});

export const _logSecretAction = internalMutation({
  args: {
    projectId: v.id("project"),
    projectName: v.string(),
    environmentId: v.id("environment"),
    environmentName: v.string(),
    folderId: v.optional(v.id("folder")),
    folderName: v.optional(v.string()),
    secretId: v.optional(v.id("secret")),
    key: v.optional(v.string()),
    newKey: v.optional(v.string()),
    userId: v.string(),
    secretAction: v.union(
      v.literal("secret.created"),
      v.literal("secret.updated"),
      v.literal("secret.deleted"),
      v.literal("secret.exported"),
      v.literal("secrets.bulk.updated"),
      v.literal("secrets.bulk_deleted"),
      v.literal("secrets.bulk_exported"),
    ),
    exportFormat: v.optional(v.union(v.literal("relic"), v.literal("env"), v.literal("json"))),
    exportCount: v.optional(v.number()),
    affectedValueCount: v.optional(v.number()),
    deleteCount: v.optional(v.number()),
  },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args) => {
    await ctx.db.insert("actionLog", {
      action: args.secretAction,
      projectId: args.projectId,
      projectName: args.projectName,
      environmentId: args.environmentId,
      environmentName: args.environmentName,
      timestamp: Date.now(),
      userId: args.userId,
      metadata: {
        folderId: args.folderId,
        folderName: args.folderName,
        secretId: args.secretId,
        key: args.key,
        newKey: args.newKey,
        exportFormat: args.exportFormat,
        exportCount: args.exportCount,
        affectedValueCount: args.affectedValueCount,
        deleteCount: args.deleteCount,
      },
    });

    return { success: true };
  },
});

export const _loadActionLogsByProject = internalQuery({
  args: {
    projectId: v.id("project"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("actionLog")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .paginate(args.paginationOpts);

    return result;
  },
});

export const _loadActionLogsByEnvironment = internalQuery({
  args: {
    environmentId: v.id("environment"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("actionLog")
      .withIndex("by_environment", (q) => q.eq("environmentId", args.environmentId))
      .order("desc")
      .paginate(args.paginationOpts);

    return result;
  },
});

export const loadActionLogsByProject = protectedAction({
  args: {
    projectId: v.id("project"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx: ProtectedActionCtx, args): Promise<PaginationResult<Doc<"actionLog">>> => {
    await checkRateLimit(ctx, "read");

    const project = await ctx.runQuery(internal.project._loadProjectById, {
      projectId: args.projectId,
    });

    await assertProjectAccess(ctx, project);

    return await ctx.runQuery(internal.actionLog._loadActionLogsByProject, {
      projectId: args.projectId,
      paginationOpts: args.paginationOpts,
    });
  },
});

export const loadActionLogsByEnvironment = protectedAction({
  args: {
    environmentId: v.id("environment"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx: ProtectedActionCtx, args): Promise<PaginationResult<Doc<"actionLog">>> => {
    await checkRateLimit(ctx, "read");

    const environment = await ctx.runQuery(internal.environment._loadEnvironmentById, {
      environmentId: args.environmentId,
    });

    const project = await ctx.runQuery(internal.project._loadProjectById, {
      projectId: environment.projectId,
    });

    await assertProjectAccess(ctx, project);

    return await ctx.runQuery(internal.actionLog._loadActionLogsByEnvironment, {
      environmentId: environment._id,
      paginationOpts: args.paginationOpts,
    });
  },
});
