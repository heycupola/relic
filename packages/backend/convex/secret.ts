import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { canWriteProject, hasProjectAccess } from "./lib/access";
import { protectedMutation, protectedQuery } from "./lib/middleware";
import { checkProjectIdOrganizationSuspended } from "./lib/organizationAccess";
import { isProjectAccessible } from "./lib/projectAccess";
import type { ProtectedMutationCtx, ProtectedQueryCtx } from "./lib/types";

export const createSecret = protectedMutation({
  args: {
    environmentId: v.id("environment"),
    folderId: v.optional(v.id("folder")),
    key: v.string(),
    encryptedValue: v.string(),
    description: v.optional(v.string()),
    encryptionKeyVersion: v.number(),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (
    ctx: ProtectedMutationCtx,
    args: {
      environmentId: Id<"environment">;
      folderId?: Id<"folder">;
      key: string;
      encryptedValue: string;
      description?: string;
      encryptionKeyVersion: number;
      tags?: string[];
    },
  ) => {
    const environment = await ctx.db.get(args.environmentId);

    if (!environment) {
      throw new Error("Environment not found");
    }

    const project = await ctx.db.get(environment.projectId);

    if (!project) {
      throw new Error("Project not found");
    }

    if (project.isArchived) {
      throw new Error("This project is archived. Unarchive it to access its data.");
    }

    await checkProjectIdOrganizationSuspended(ctx, environment.projectId);

    // NOTE: check if project is restricted for personal projects
    const accessCheck = await isProjectAccessible(ctx, environment.projectId);

    if (!accessCheck.accessible) {
      throw new Error(
        "This project is restricted. Upgrade your plan or archive other projects to access it.",
      );
    }

    if (!(await canWriteProject(ctx, project))) {
      throw new Error("You do not have permission to create secrets");
    }

    if (args.folderId) {
      const folder = await ctx.db.get(args.folderId);
      if (!folder) {
        throw new Error("Folder not found");
      }
      if (folder.environmentId !== args.environmentId) {
        throw new Error("Folder does not belong to this environment");
      }
    }

    const existingSecret = await ctx.db
      .query("secret")
      .withIndex("by_env_and_key", (q) =>
        q.eq("environmentId", args.environmentId).eq("key", args.key),
      )
      .filter((q) =>
        q.and(q.eq(q.field("isDeleted"), false), q.eq(q.field("folderId"), args.folderId)),
      )
      .first();

    if (existingSecret) {
      const location = args.folderId ? "this folder" : "this environment's root";
      throw new Error(`Cannot restore: a secret with this key already exists in ${location}`);
    }

    const now = Date.now();
    const secretId = await ctx.db.insert("secret", {
      projectId: environment.projectId,
      environmentId: args.environmentId,
      folderId: args.folderId,
      key: args.key,
      encryptedValue: args.encryptedValue,
      description: args.description,
      encryptionKeyVersion: args.encryptionKeyVersion,
      tags: args.tags,
      isDeleted: false,
      createdBy: ctx.userId,
      createdAt: now,
      updatedBy: ctx.userId,
      updatedAt: now,
    });

    await ctx.db.insert("secretHistory", {
      secretId,
      projectId: environment.projectId,
      environmentId: args.environmentId,
      key: args.key,
      encryptedValue: args.encryptedValue,
      description: args.description,
      encryptionKeyVersion: args.encryptionKeyVersion,
      action: "created",
      changedBy: ctx.userId,
      changedAt: now,
    });

    return { success: true, secretId };
  },
});

export const listSecrets = protectedQuery({
  args: {
    environmentId: v.id("environment"),
    folderId: v.optional(v.id("folder")),
    includeDeleted: v.optional(v.boolean()),
  },
  handler: async (
    ctx: ProtectedQueryCtx,
    args: { environmentId: Id<"environment">; folderId?: Id<"folder">; includeDeleted?: boolean },
  ) => {
    const environment = await ctx.db.get(args.environmentId);

    if (!environment) {
      throw new Error("Environment not found");
    }

    const project = await ctx.db.get(environment.projectId);

    if (!project) {
      throw new Error("Project not found");
    }

    if (project.isArchived) {
      throw new Error("This project is archived. Unarchive it to access its data.");
    }

    await checkProjectIdOrganizationSuspended(ctx, environment.projectId);

    // NOTE: check if project is restricted for personal projects
    const accessCheck = await isProjectAccessible(ctx, environment.projectId);

    if (!accessCheck.accessible) {
      throw new Error(
        "This project is restricted. Upgrade your plan or archive other projects to access it.",
      );
    }

    if (!(await hasProjectAccess(ctx, project))) {
      throw new Error("You do not have access to this environment");
    }

    const includeDeleted = args.includeDeleted || false;

    const allSecrets = await (async () => {
      if (args.folderId !== undefined) {
        return ctx.db
          .query("secret")
          .withIndex("by_folder", (q) => q.eq("folderId", args.folderId))
          .collect();
      }
      return ctx.db
        .query("secret")
        .withIndex("by_environment", (q) => q.eq("environmentId", args.environmentId))
        .filter((q) => q.eq(q.field("folderId"), undefined))
        .collect();
    })();

    const secrets = includeDeleted ? allSecrets : allSecrets.filter((s) => !s.isDeleted);

    return secrets.map((s) => ({
      id: s._id,
      key: s.key,
      description: s.description,
      tags: s.tags,
      isDeleted: s.isDeleted,
      createdBy: s.createdBy,
      createdAt: s.createdAt,
      updatedBy: s.updatedBy,
      updatedAt: s.updatedAt,
    }));
  },
});

export const getSecret = protectedQuery({
  args: {
    secretId: v.id("secret"),
  },
  handler: async (ctx: ProtectedQueryCtx, args: { secretId: Id<"secret"> }) => {
    const secret = await ctx.db.get(args.secretId);

    if (!secret) {
      throw new Error("Secret not found");
    }

    const project = await ctx.db.get(secret.projectId);

    if (!project) {
      throw new Error("Project not found");
    }

    if (project.isArchived) {
      throw new Error("This project is archived. Unarchive it to access its data.");
    }

    await checkProjectIdOrganizationSuspended(ctx, secret.projectId);

    // NOTE: check if project is restricted for personal projects
    const accessCheck = await isProjectAccessible(ctx, secret.projectId);

    if (!accessCheck.accessible) {
      throw new Error(
        "This project is restricted. Upgrade your plan or archive other projects to access it.",
      );
    }

    if (!(await hasProjectAccess(ctx, project))) {
      throw new Error("You do not have access to this secret");
    }

    return {
      id: secret._id,
      projectId: secret.projectId,
      environmentId: secret.environmentId,
      folderId: secret.folderId,
      key: secret.key,
      encryptedValue: secret.encryptedValue,
      description: secret.description,
      encryptionKeyVersion: secret.encryptionKeyVersion,
      tags: secret.tags,
      isDeleted: secret.isDeleted,
      createdBy: secret.createdBy,
      createdAt: secret.createdAt,
      updatedBy: secret.updatedBy,
      updatedAt: secret.updatedAt,
    };
  },
});

export const updateSecret = protectedMutation({
  args: {
    secretId: v.id("secret"),
    encryptedValue: v.optional(v.string()),
    description: v.optional(v.string()),
    encryptionKeyVersion: v.optional(v.number()),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (
    ctx: ProtectedMutationCtx,
    args: {
      secretId: Id<"secret">;
      encryptedValue?: string;
      description?: string;
      encryptionKeyVersion?: number;
      tags?: string[];
    },
  ) => {
    const secret = await ctx.db.get(args.secretId);

    if (!secret) {
      throw new Error("Secret not found");
    }

    if (secret.isDeleted) {
      throw new Error("Cannot update a deleted secret. Restore it first");
    }

    const project = await ctx.db.get(secret.projectId);

    if (!project) {
      throw new Error("Project not found");
    }

    if (project.isArchived) {
      throw new Error("This project is archived. Unarchive it to access its data.");
    }

    await checkProjectIdOrganizationSuspended(ctx, secret.projectId);

    // NOTE: check if project is restricted for personal projects
    const accessCheck = await isProjectAccessible(ctx, secret.projectId);

    if (!accessCheck.accessible) {
      throw new Error(
        "This project is restricted. Upgrade your plan or archive other projects to access it.",
      );
    }

    if (!(await canWriteProject(ctx, project))) {
      throw new Error("You do not have permission to update this secret");
    }

    const now = Date.now();
    const updates: {
      updatedBy: Id<"user">;
      updatedAt: number;
      encryptedValue?: string;
      description?: string;
      encryptionKeyVersion?: number;
      tags?: string[];
    } = {
      updatedBy: ctx.userId,
      updatedAt: now,
    };

    if (args.encryptedValue !== undefined) updates.encryptedValue = args.encryptedValue;
    if (args.description !== undefined) updates.description = args.description;
    if (args.encryptionKeyVersion !== undefined)
      updates.encryptionKeyVersion = args.encryptionKeyVersion;
    if (args.tags !== undefined) updates.tags = args.tags;

    await ctx.db.patch(args.secretId, updates);

    await ctx.db.insert("secretHistory", {
      secretId: args.secretId,
      projectId: secret.projectId,
      environmentId: secret.environmentId,
      key: secret.key,
      encryptedValue: args.encryptedValue || secret.encryptedValue,
      description: args.description !== undefined ? args.description : secret.description,
      encryptionKeyVersion: args.encryptionKeyVersion || secret.encryptionKeyVersion,
      action: "updated",
      changedBy: ctx.userId,
      changedAt: now,
    });

    return { success: true };
  },
});

export const deleteSecret = protectedMutation({
  args: {
    secretId: v.id("secret"),
  },
  handler: async (ctx: ProtectedMutationCtx, args: { secretId: Id<"secret"> }) => {
    const secret = await ctx.db.get(args.secretId);

    if (!secret) {
      throw new Error("Secret not found");
    }

    if (secret.isDeleted) {
      throw new Error("Secret is already deleted");
    }

    const project = await ctx.db.get(secret.projectId);

    if (!project) {
      throw new Error("Project not found");
    }

    if (project.isArchived) {
      throw new Error("This project is archived. Unarchive it to access its data.");
    }

    await checkProjectIdOrganizationSuspended(ctx, secret.projectId);

    // NOTE: check if project is restricted for personal projects
    const accessCheck = await isProjectAccessible(ctx, secret.projectId);

    if (!accessCheck.accessible) {
      throw new Error(
        "This project is restricted. Upgrade your plan or archive other projects to access it.",
      );
    }

    if (!(await canWriteProject(ctx, project))) {
      throw new Error("You do not have permission to delete this secret");
    }

    const now = Date.now();
    await ctx.db.patch(args.secretId, {
      isDeleted: true,
      updatedBy: ctx.userId,
      updatedAt: now,
    });

    await ctx.db.insert("secretHistory", {
      secretId: args.secretId,
      projectId: secret.projectId,
      environmentId: secret.environmentId,
      key: secret.key,
      encryptedValue: secret.encryptedValue,
      description: secret.description,
      encryptionKeyVersion: secret.encryptionKeyVersion,
      action: "deleted",
      changedBy: ctx.userId,
      changedAt: now,
    });

    return { success: true };
  },
});

export const restoreSecret = protectedMutation({
  args: {
    secretId: v.id("secret"),
  },
  handler: async (ctx: ProtectedMutationCtx, args: { secretId: Id<"secret"> }) => {
    const secret = await ctx.db.get(args.secretId);

    if (!secret) {
      throw new Error("Secret not found");
    }

    if (!secret.isDeleted) {
      throw new Error("Secret is not deleted");
    }

    const project = await ctx.db.get(secret.projectId);

    if (!project) {
      throw new Error("Project not found");
    }

    if (project.isArchived) {
      throw new Error("This project is archived. Unarchive it to access its data.");
    }

    await checkProjectIdOrganizationSuspended(ctx, secret.projectId);

    // NOTE: check if project is restricted for personal projects
    const accessCheck = await isProjectAccessible(ctx, secret.projectId);

    if (!accessCheck.accessible) {
      throw new Error(
        "This project is restricted. Upgrade your plan or archive other projects to access it.",
      );
    }

    if (!(await canWriteProject(ctx, project))) {
      throw new Error("You do not have permission to restore this secret");
    }

    const existingSecret = await ctx.db
      .query("secret")
      .withIndex("by_env_and_key", (q) =>
        q.eq("environmentId", secret.environmentId).eq("key", secret.key),
      )
      .filter((q) =>
        q.and(q.eq(q.field("isDeleted"), false), q.eq(q.field("folderId"), secret.folderId)),
      )
      .first();

    if (existingSecret) {
      const location = secret.folderId ? "this folder" : "this environment's root";
      throw new Error(`Cannot restore: a secret with this key already exists in ${location}`);
    }

    const now = Date.now();
    await ctx.db.patch(args.secretId, {
      isDeleted: false,
      updatedBy: ctx.userId,
      updatedAt: now,
    });

    await ctx.db.insert("secretHistory", {
      secretId: args.secretId,
      projectId: secret.projectId,
      environmentId: secret.environmentId,
      key: secret.key,
      encryptedValue: secret.encryptedValue,
      description: secret.description,
      encryptionKeyVersion: secret.encryptionKeyVersion,
      action: "restored",
      changedBy: ctx.userId,
      changedAt: now,
    });

    return { success: true };
  },
});

export const listSecretHistory = protectedQuery({
  args: {
    secretId: v.id("secret"),
  },
  handler: async (ctx: ProtectedQueryCtx, args: { secretId: Id<"secret"> }) => {
    const secret = await ctx.db.get(args.secretId);

    if (!secret) {
      throw new Error("Secret not found");
    }

    const project = await ctx.db.get(secret.projectId);

    if (!project) {
      throw new Error("Project not found");
    }

    if (project.isArchived) {
      throw new Error("This project is archived. Unarchive it to access its data.");
    }

    await checkProjectIdOrganizationSuspended(ctx, secret.projectId);

    // NOTE: check if project is restricted for personal projects
    const accessCheck = await isProjectAccessible(ctx, secret.projectId);

    if (!accessCheck.accessible) {
      throw new Error(
        "This project is restricted. Upgrade your plan or archive other projects to access it.",
      );
    }

    if (!(await hasProjectAccess(ctx, project))) {
      throw new Error("You do not have access to this secret");
    }

    const history = await ctx.db
      .query("secretHistory")
      .withIndex("by_secret", (q) => q.eq("secretId", args.secretId))
      .order("desc")
      .take(100);

    return history.map((h) => ({
      id: h._id,
      key: h.key,
      encryptedValue: h.encryptedValue,
      description: h.description,
      encryptionKeyVersion: h.encryptionKeyVersion,
      action: h.action,
      changedBy: h.changedBy,
      changedAt: h.changedAt,
    }));
  },
});
