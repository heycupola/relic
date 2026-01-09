import { ConvexError, v } from "convex/values";
import { doc } from "convex-helpers/validators";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import { assertProjectAccess } from "./lib/access";
import { alreadyExistsError, createError, ErrorCode, notFoundError } from "./lib/errors";
import { generateSlug } from "./lib/helpers";
import { protectedMutation } from "./lib/middleware";
import { checkRateLimit } from "./lib/rateLimit";
import { ErrorSeverity, type ProtectedMutationCtx } from "./lib/types";
import schema from "./schema";

export const createFolder = protectedMutation({
  args: {
    environmentId: v.id("environment"),
    name: v.string(),
    // description: v.optional(v.string()),
  },
  returns: v.object({ success: v.boolean(), folderId: v.id("folder"), path: v.string() }),
  handler: async (
    ctx: ProtectedMutationCtx,
    args: { environmentId: Id<"environment">; name: string },
  ): Promise<{ success: boolean; folderId: Id<"folder">; path: string }> => {
    const environment: Doc<"environment"> = await ctx.runQuery(
      internal.environment._loadEnvironmentById,
      {
        environmentId: args.environmentId,
      },
    );

    const project: Doc<"project"> = await ctx.runQuery(internal.project._loadProjectById, {
      projectId: environment.projectId,
    });

    await assertProjectAccess(ctx, project);

    await checkRateLimit(ctx, "write");

    const slug = generateSlug(args.name);
    const existingFolder = await ctx.runQuery(internal.folder._loadFolderBySlug, {
      environmentId: args.environmentId,
      slug,
    });

    if (existingFolder) {
      throw alreadyExistsError("folder");
    }

    const { folderId, path }: { folderId: Id<"folder">; path: string } = await ctx.runMutation(
      internal.folder._insertFolder,
      {
        createdBy: ctx.userId,
        environmentId: environment._id,
        name: args.name,
        projectId: project._id,
        // description: args.description
      },
    );

    return { success: true, folderId, path };
  },
});

export const updateFolder = protectedMutation({
  args: {
    folderId: v.id("folder"),
    name: v.optional(v.string()),
  },
  handler: async (ctx: ProtectedMutationCtx, args: { folderId: Id<"folder">; name?: string }) => {
    const folder = await ctx.runQuery(internal.folder._loadFolderId, {
      folderId: args.folderId,
    });

    const project = await ctx.runQuery(internal.project._loadProjectById, {
      projectId: folder.projectId,
    });

    if (args.name) {
      const existingFolder = await ctx.runQuery(internal.folder._loadFolderBySlug, {
        environmentId: folder.environmentId,
        slug: generateSlug(args.name),
      });

      if (existingFolder && existingFolder._id !== args.folderId) {
        throw new ConvexError({
          code: "DUPLICATE_FOLDER_NAME",
          message: "A folder with this name already exists in this environment",
          severity: ErrorSeverity.High,
        });
      }
    }

    await assertProjectAccess(ctx, project);

    await checkRateLimit(ctx, "write");

    await ctx.runMutation(internal.folder._updateFolder, {
      folderId: args.folderId,
      updates: {
        name: args.name,
      },
    });

    return { success: true };
  },
});

export const deleteFolder = protectedMutation({
  args: {
    folderId: v.id("folder"),
  },
  handler: async (ctx: ProtectedMutationCtx, args: { folderId: Id<"folder"> }) => {
    const folder = await ctx.runQuery(internal.folder._loadFolderId, {
      folderId: args.folderId,
    });

    const project = await ctx.runQuery(internal.project._loadProjectById, {
      projectId: folder.projectId,
    });

    await assertProjectAccess(ctx, project);

    await checkRateLimit(ctx, "delete");

    const secrets = await ctx.runQuery(internal.secret._loadSecretsByFolderId, {
      folderId: args.folderId,
    });

    if (secrets.length > 0) {
      throw createError({
        code: ErrorCode.CANNOT_DELETE_NON_EMPTY,
        message: "Cannot delete folder that contains secrets. Please remove all secrets first",
        severity: ErrorSeverity.High,
      });
    }

    await ctx.runMutation(internal.folder._deleteFolder, {
      folderId: args.folderId,
    });

    return { success: true };
  },
});

export const _loadFolderId = internalQuery({
  args: {
    folderId: v.id("folder"),
  },
  returns: doc(schema, "folder"),
  handler: async (ctx, args) => {
    const folder = await ctx.db
      .query("folder")
      .withIndex("by_id", (q) => q.eq("_id", args.folderId))
      .first();

    if (!folder) {
      throw notFoundError("folder");
    }

    return folder;
  },
});

export const _loadFolderBySlug = internalQuery({
  args: {
    environmentId: v.id("environment"),
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    const folder = await ctx.db
      .query("folder")
      .withIndex("by_environment_and_slug", (q) =>
        q.eq("environmentId", args.environmentId).eq("slug", args.slug),
      )
      .filter((q) => q.eq(q.field("slug"), args.slug))
      .first();

    return folder;
  },
});

export const _loadFoldersByEnvironmentId = internalQuery({
  args: {
    environmentId: v.id("environment"),
  },
  returns: v.array(doc(schema, "folder")),
  handler: async (ctx, args) => {
    const folders = await ctx.db
      .query("folder")
      .withIndex("by_environment", (q) => q.eq("environmentId", args.environmentId))
      .collect();

    return folders;
  },
});

export const _insertFolder = internalMutation({
  args: {
    createdBy: v.string(),
    environmentId: v.id("environment"),
    projectId: v.id("project"),
    name: v.string(),
    // description: v.optional(v.string()),
    // parentFolderId: v.optional(v.id("folder")),
  },
  returns: v.object({ success: v.boolean(), folderId: v.id("folder"), path: v.string() }),
  handler: async (
    ctx,
    args,
  ): Promise<{ success: boolean; folderId: Id<"folder">; path: string }> => {
    const slug = generateSlug(args.name);
    const now = Date.now();

    const path = `/${slug}`;

    const folderId = await ctx.db.insert("folder", {
      environmentId: args.environmentId,
      projectId: args.projectId,
      name: args.name,
      slug,
      path,
      // description: args.description,
      // parentFolderId: args.parentFolderId,
      createdBy: args.createdBy,
      createdAt: now,
      updatedAt: now,
    });

    return { success: true, folderId, path };
  },
});

export const _updateFolder = internalMutation({
  args: {
    folderId: v.id("folder"),
    updates: v.object({
      name: v.optional(v.string()),
      // description: v.optional(v.string()),
    }),
  },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args) => {
    const updates: {
      updatedAt: number;
      name?: string;
      slug?: string;
      description?: string;
    } = { updatedAt: Date.now() };
    if (args.updates.name !== undefined) {
      updates.name = args.updates.name;
      updates.slug = generateSlug(args.updates.name);
    }

    await ctx.db.patch(args.folderId, updates);

    return { success: true };
  },
});

export const _deleteFolder = internalMutation({
  args: {
    folderId: v.id("folder"),
  },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args) => {
    await ctx.db.delete(args.folderId);

    return { success: true };
  },
});
