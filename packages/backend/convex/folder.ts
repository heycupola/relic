import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { canAdminProject, canWriteProject, hasProjectAccess } from "./lib/access";
import { protectedMutation, protectedQuery } from "./lib/middleware";
import type { ProtectedMutationCtx, ProtectedQueryCtx } from "./lib/types";

export const createFolder = protectedMutation({
  args: {
    environmentId: v.id("environment"),
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (
    ctx: ProtectedMutationCtx,
    args: { environmentId: Id<"environment">; name: string; slug: string; description?: string },
  ) => {
    const environment = await ctx.db.get(args.environmentId);

    if (!environment) {
      throw new Error("Environment not found");
    }

    const project = await ctx.db.get(environment.projectId);

    if (!project) {
      throw new Error("Project not found");
    }

    if (!(await canWriteProject(ctx, project))) {
      throw new Error("You do not have access to this environment");
    }

    const path = `/${args.slug}`;

    const existingFolder = await ctx.db
      .query("folder")
      .withIndex("by_environment", (q) => q.eq("environmentId", args.environmentId))
      .filter((q) => q.eq(q.field("slug"), args.slug))
      .first();

    if (existingFolder) {
      throw new Error("A folder with this slug already exists in this environment");
    }

    const now = Date.now();
    const folderId = await ctx.db.insert("folder", {
      environmentId: args.environmentId,
      projectId: environment.projectId,
      name: args.name,
      slug: args.slug,
      path,
      description: args.description,
      parentFolderId: undefined,
      createdBy: ctx.userId,
      createdAt: now,
      updatedAt: now,
    });

    return { success: true, folderId, path };
  },
});

export const listFolders = protectedQuery({
  args: {
    environmentId: v.id("environment"),
  },
  handler: async (ctx: ProtectedQueryCtx, args: { environmentId: Id<"environment"> }) => {
    const environment = await ctx.db.get(args.environmentId);

    if (!environment) {
      throw new Error("Environment not found");
    }

    const project = await ctx.db.get(environment.projectId);

    if (!project) {
      throw new Error("Project not found");
    }

    if (!(await hasProjectAccess(ctx, project))) {
      throw new Error("You do not have access to this environment");
    }

    const folders = await ctx.db
      .query("folder")
      .withIndex("by_environment", (q) => q.eq("environmentId", args.environmentId))
      .collect();

    return folders.map((folder) => ({
      id: folder._id,
      name: folder.name,
      slug: folder.slug,
      path: folder.path,
      description: folder.description,
      createdAt: folder.createdAt,
      updatedAt: folder.updatedAt,
    }));
  },
});

export const getFolder = protectedQuery({
  args: {
    folderId: v.id("folder"),
  },
  handler: async (ctx: ProtectedQueryCtx, args: { folderId: Id<"folder"> }) => {
    const folder = await ctx.db.get(args.folderId);

    if (!folder) {
      throw new Error("Folder not found");
    }

    const project = await ctx.db.get(folder.projectId);

    if (!project) {
      throw new Error("Project not found");
    }

    if (!(await hasProjectAccess(ctx, project))) {
      throw new Error("You do not have access to this folder");
    }

    return {
      id: folder._id,
      environmentId: folder.environmentId,
      projectId: folder.projectId,
      name: folder.name,
      slug: folder.slug,
      path: folder.path,
      description: folder.description,
      parentFolderId: folder.parentFolderId,
      createdBy: folder.createdBy,
      createdAt: folder.createdAt,
      updatedAt: folder.updatedAt,
    };
  },
});

export const updateFolder = protectedMutation({
  args: {
    folderId: v.id("folder"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (
    ctx: ProtectedMutationCtx,
    args: { folderId: Id<"folder">; name?: string; description?: string },
  ) => {
    const folder = await ctx.db.get(args.folderId);

    if (!folder) {
      throw new Error("Folder not found");
    }

    const project = await ctx.db.get(folder.projectId);

    if (!project) {
      throw new Error("Project not found");
    }

    if (!(await canWriteProject(ctx, project))) {
      throw new Error("You do not have permission to update this folder");
    }

    const updates: {
      updatedAt: number;
      name?: string;
      description?: string;
    } = { updatedAt: Date.now() };
    if (args.name !== undefined) updates.name = args.name;
    if (args.description !== undefined) updates.description = args.description;

    await ctx.db.patch(args.folderId, updates);

    return { success: true };
  },
});

export const deleteFolder = protectedMutation({
  args: {
    folderId: v.id("folder"),
  },
  handler: async (ctx: ProtectedMutationCtx, args: { folderId: Id<"folder"> }) => {
    const folder = await ctx.db.get(args.folderId);

    if (!folder) {
      throw new Error("Folder not found");
    }

    const project = await ctx.db.get(folder.projectId);

    if (!project) {
      throw new Error("Project not found");
    }

    if (!(await canAdminProject(ctx, project))) {
      throw new Error("You do not have permission to delete this folder");
    }

    const secrets = await ctx.db
      .query("secret")
      .withIndex("by_folder", (q) => q.eq("folderId", args.folderId))
      .filter((q) => q.eq(q.field("isDeleted"), false))
      .first();

    if (secrets) {
      throw new Error("Cannot delete folder with secrets. Please delete or move secrets first.");
    }

    await ctx.db.delete(args.folderId);

    return { success: true };
  },
});
