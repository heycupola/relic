import { v } from "convex/values";
import { canAdminProject, canWriteProject, hasProjectAccess } from "./lib/access";
import { protectedMutation, protectedQuery } from "./lib/middleware";

export const createFolder = protectedMutation({
  args: {
    environmentId: v.id("environment"),
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    parentFolderId: v.optional(v.id("folder")),
  },
  handler: async (ctx, args) => {
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

    let parentPath = "";
    if (args.parentFolderId) {
      const parentFolder = await ctx.db.get(args.parentFolderId);

      if (!parentFolder) {
        throw new Error("Parent folder not found");
      }

      if (parentFolder.environmentId !== args.environmentId) {
        throw new Error("Parent folder does not belong to the same environment");
      }

      parentPath = parentFolder.path;
    }

    const path = parentPath ? `${parentPath}/${args.slug}` : `/${args.slug}`;

    const existingFolder = await ctx.db
      .query("folder")
      .withIndex("by_env_and_parent", (q) =>
        q.eq("environmentId", args.environmentId).eq("parentFolderId", args.parentFolderId),
      )
      .filter((q) => q.eq(q.field("slug"), args.slug))
      .first();

    if (existingFolder) {
      throw new Error("A folder with this slug already exists at this level");
    }

    const now = Date.now();
    const folderId = await ctx.db.insert("folder", {
      environmentId: args.environmentId,
      projectId: environment.projectId,
      name: args.name,
      slug: args.slug,
      path,
      description: args.description,
      parentFolderId: args.parentFolderId,
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
    parentFolderId: v.optional(v.id("folder")),
  },
  handler: async (ctx, args) => {
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
      .withIndex("by_env_and_parent", (q) =>
        q.eq("environmentId", args.environmentId).eq("parentFolderId", args.parentFolderId),
      )
      .collect();

    return folders.map((folder) => ({
      id: folder._id,
      name: folder.name,
      slug: folder.slug,
      path: folder.path,
      description: folder.description,
      parentFolderId: folder.parentFolderId,
      createdAt: folder.createdAt,
      updatedAt: folder.updatedAt,
    }));
  },
});

export const getFolder = protectedQuery({
  args: {
    folderId: v.id("folder"),
  },
  handler: async (ctx, args) => {
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
  handler: async (ctx, args) => {
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
  handler: async (ctx, args) => {
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

    const subfolders = await ctx.db
      .query("folder")
      .withIndex("by_parent", (q) => q.eq("parentFolderId", args.folderId))
      .first();

    if (subfolders) {
      throw new Error("Cannot delete folder with subfolders. Please delete subfolders first.");
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

export const moveFolder = protectedMutation({
  args: {
    folderId: v.id("folder"),
    newParentFolderId: v.optional(v.id("folder")),
  },
  handler: async (ctx, args) => {
    const folder = await ctx.db.get(args.folderId);

    if (!folder) {
      throw new Error("Folder not found");
    }

    const project = await ctx.db.get(folder.projectId);

    if (!project) {
      throw new Error("Project not found");
    }

    if (!(await canWriteProject(ctx, project))) {
      throw new Error("You do not have permission to move this folder");
    }

    let newParentPath = "";
    if (args.newParentFolderId) {
      const newParentFolder = await ctx.db.get(args.newParentFolderId);

      if (!newParentFolder) {
        throw new Error("New parent folder not found");
      }

      if (newParentFolder.environmentId !== folder.environmentId) {
        throw new Error("Cannot move folder to a different environment");
      }

      if (
        args.newParentFolderId === args.folderId ||
        newParentFolder.path.startsWith(`${folder.path}/`)
      ) {
        throw new Error("Cannot move folder into itself or its descendants");
      }

      newParentPath = newParentFolder.path;
    }

    const newPath = newParentPath ? `${newParentPath}/${folder.slug}` : `/${folder.slug}`;

    const existingFolder = await ctx.db
      .query("folder")
      .withIndex("by_env_and_parent", (q) =>
        q.eq("environmentId", folder.environmentId).eq("parentFolderId", args.newParentFolderId),
      )
      .filter((q) => q.eq(q.field("slug"), folder.slug))
      .first();

    if (existingFolder && existingFolder._id !== args.folderId) {
      throw new Error("A folder with this slug already exists at the destination");
    }

    const oldPath = folder.path;
    await ctx.db.patch(args.folderId, {
      parentFolderId: args.newParentFolderId,
      path: newPath,
      updatedAt: Date.now(),
    });

    const allFolders = await ctx.db
      .query("folder")
      .withIndex("by_environment", (q) => q.eq("environmentId", folder.environmentId))
      .collect();

    const now = Date.now();
    for (const descendantFolder of allFolders) {
      if (descendantFolder.path.startsWith(`${oldPath}/`)) {
        const updatedPath = descendantFolder.path.replace(oldPath, newPath);
        await ctx.db.patch(descendantFolder._id, {
          path: updatedPath,
          updatedAt: now,
        });
      }
    }

    return { success: true, newPath };
  },
});
