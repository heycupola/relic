import type { PaginationResult } from "convex/server";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import { assertProjectAccess } from "./lib/access";
import { protectedAction } from "./lib/middleware";
import type { ProtectedActionCtx } from "./lib/types";

export const _logSecretCreate = internalMutation({
  args: {
    projectId: v.id("project"),
    userId: v.id("user"),
    keyPath: v.string(),
  },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args) => {
    await ctx.db.insert("actionLog", {
      action: "secret.created",
      projectId: args.projectId,
      timestamp: Date.now(),
      userId: args.userId,
      metadata: {
        keyPath: args.keyPath,
      },
    });

    return { success: true };
  },
});

export const _logSecretUpdate = internalMutation({
  args: {
    projectId: v.id("project"),
    userId: v.id("user"),
    keyPath: v.string(),
  },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args) => {
    await ctx.db.insert("actionLog", {
      action: "secret.updated",
      projectId: args.projectId,
      timestamp: Date.now(),
      userId: args.userId,
      metadata: {
        keyPath: args.keyPath,
      },
    });

    return { success: true };
  },
});

export const _logSecretDelete = internalMutation({
  args: {
    projectId: v.id("project"),
    userId: v.id("user"),
    keyPath: v.string(),
  },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args) => {
    await ctx.db.insert("actionLog", {
      action: "secret.deleted",
      projectId: args.projectId,
      timestamp: Date.now(),
      userId: args.userId,
      metadata: {
        keyPath: args.keyPath,
      },
    });

    return { success: true };
  },
});

export const _logSecretExport = internalMutation({
  args: {
    projectId: v.id("project"),
    userId: v.id("user"),
    keyPath: v.string(),
    exportFormat: v.optional(v.union(v.literal("relic"), v.literal("env"), v.literal("json"))),
  },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args) => {
    await ctx.db.insert("actionLog", {
      action: "secret.exported",
      projectId: args.projectId,
      timestamp: Date.now(),
      userId: args.userId,
      metadata: {
        keyPath: args.keyPath,
        exportFormat: args.exportFormat,
      },
    });

    return { success: true };
  },
});

export const _logSecretBulkUpdate = internalMutation({
  args: {
    projectId: v.id("project"),
    userId: v.id("user"),
    affectedValueCount: v.number(),
    folderName: v.optional(v.string()),
  },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args) => {
    await ctx.db.insert("actionLog", {
      action: "secrets.bulk_exported",
      projectId: args.projectId,
      timestamp: Date.now(),
      userId: args.userId,
      metadata: {
        affectedValueCount: args.affectedValueCount,
        folderName: args.folderName,
      },
    });

    return { success: true };
  },
});

export const _logSecretBulkDelete = internalMutation({
  args: {
    projectId: v.id("project"),
    userId: v.id("user"),
    affectedValueCount: v.number(),
    deleteCount: v.number(),
    folderName: v.optional(v.string()),
  },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args) => {
    await ctx.db.insert("actionLog", {
      action: "secrets.bulk_deleted",
      projectId: args.projectId,
      timestamp: Date.now(),
      userId: args.userId,
      metadata: {
        folderName: args.folderName,
        affectedValueCount: args.affectedValueCount,
        deleteCount: args.deleteCount,
      },
    });

    return { success: true };
  },
});

export const _logSecretBulkExport = internalMutation({
  args: {
    projectId: v.id("project"),
    userId: v.id("user"),
    exportCount: v.number(),
    exportFormat: v.optional(v.union(v.literal("relic"), v.literal("env"), v.literal("json"))),
    folderName: v.optional(v.string()),
  },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args) => {
    await ctx.db.insert("actionLog", {
      action: "secrets.bulk_exported",
      projectId: args.projectId,
      timestamp: Date.now(),
      userId: args.userId,
      metadata: {
        exportCount: args.exportCount,
        exportFormat: args.exportFormat,
        folderName: args.folderName,
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

export const loadActionLogsByProject = protectedAction({
  args: {
    projectId: v.id("project"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx: ProtectedActionCtx, args): Promise<PaginationResult<Doc<"actionLog">>> => {
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
