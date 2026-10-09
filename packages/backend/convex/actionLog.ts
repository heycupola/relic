import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { assertProjectAccess } from "./lib/access";
import { getProjectOrThrow } from "./lib/data";
import { notFoundError } from "./lib/errors";
import { protectedQuery } from "./lib/middleware";
export const _insertActionLog = internalMutation({
  args: {
    projectId: v.optional(v.id("project")),
    projectName: v.optional(v.string()),
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
    environmentId: v.optional(v.id("environment")),
    environmentName: v.optional(v.string()),
    metadata: v.optional(
      v.object({
        folderId: v.optional(v.id("folder")),
        folderName: v.optional(v.string()),
        environmentName: v.optional(v.string()),
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
        apiKeyPrefix: v.optional(v.string()),
        pushTarget: v.optional(v.string()),
        pushDestination: v.optional(v.string()),
        pushDryRun: v.optional(v.boolean()),
      }),
    ),
  },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args) => {
    await ctx.db.insert("actionLog", {
      action: args.action,
      projectId: args.projectId,
      projectName: args.projectName,
      environmentId: args.environmentId,
      environmentName: args.environmentName,
      timestamp: Date.now(),
      userId: args.userId,
      metadata: args.metadata,
    });

    return { success: true };
  },
});

export const loadActionLogsByProject = protectedQuery({
  args: {
    projectId: v.id("project"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const project = await getProjectOrThrow(ctx, args.projectId);
    await assertProjectAccess(ctx, project);

    return await ctx.db
      .query("actionLog")
      .withIndex("by_project", (q) => q.eq("projectId", project._id))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const loadActionLogsByEnvironment = protectedQuery({
  args: {
    environmentId: v.id("environment"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const environment = await ctx.db.get(args.environmentId);
    if (!environment) notFoundError("environment");

    const project = await getProjectOrThrow(ctx, environment.projectId);
    await assertProjectAccess(ctx, project);

    return await ctx.db
      .query("actionLog")
      .withIndex("by_environment", (q) => q.eq("environmentId", environment._id))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const loadUserActionLogs = protectedQuery({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("actionLog")
      .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});
