import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { canAdminProject, canWriteProject, hasProjectAccess, isProjectOwner } from "./lib/access";
import { protectedMutation, protectedQuery } from "./lib/middleware";
import { checkProjectOrganizationSuspended } from "./lib/organizationAccess";
import { isProjectAccessible } from "./lib/projectAccess";
import { checkRateLimit } from "./lib/rateLimit";
import type { ProtectedMutationCtx, ProtectedQueryCtx } from "./lib/types";

const MAX_ENV_COUNT = 32;

export const createEnvironment = protectedMutation({
  args: {
    projectId: v.id("project"),
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    color: v.optional(v.string()),
  },
  handler: async (
    ctx: ProtectedMutationCtx,
    args: {
      projectId: Id<"project">;
      name: string;
      slug: string;
      description?: string;
      color?: string;
    },
  ) => {
    const project = await ctx.db.get(args.projectId);

    if (!project) {
      throw new Error("Project not found");
    }

    if (project.isArchived) {
      throw new Error("This project is archived. Unarchive it to access its data.");
    }

    await checkProjectOrganizationSuspended(ctx, project);

    // NOTE: check if project is restricted for personal projects
    const accessCheck = await isProjectAccessible(ctx, args.projectId);

    if (!accessCheck.accessible) {
      throw new Error(
        "This project is restricted. Upgrade your plan or archive other projects to access it.",
      );
    }

    if (!(await canWriteProject(ctx, project))) {
      throw new Error("You do not have permission to create environments");
    }

    await checkRateLimit(ctx, "write");

    const existingEnv = await ctx.db
      .query("environment")
      .withIndex("by_project_and_slug", (q) =>
        q.eq("projectId", args.projectId).eq("slug", args.slug),
      )
      .first();

    if (existingEnv) {
      throw new Error("An environment with this slug already exists in this project");
    }

    const environments = await ctx.db
      .query("environment")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    if (environments.length >= MAX_ENV_COUNT) {
      throw new Error(
        `You've reached the maximum number of environments (${MAX_ENV_COUNT}) for this project`,
      );
    }

    const maxSortOrder = environments.reduce((max, env) => Math.max(max, env.sortOrder), -1);

    const now = Date.now();
    const environmentId = await ctx.db.insert("environment", {
      projectId: args.projectId,
      name: args.name,
      slug: args.slug,
      description: args.description,
      color: args.color,
      sortOrder: maxSortOrder + 1,
      createdBy: ctx.userId,
      createdAt: now,
      updatedAt: now,
    });

    return { success: true, environmentId };
  },
});

export const listEnvironments = protectedQuery({
  args: {
    projectId: v.id("project"),
  },
  handler: async (ctx: ProtectedQueryCtx, args: { projectId: Id<"project"> }) => {
    const project = await ctx.db.get(args.projectId);

    if (!project) {
      throw new Error("Project not found");
    }

    if (project.isArchived) {
      throw new Error("This project is archived. Unarchive it to access its data.");
    }

    await checkProjectOrganizationSuspended(ctx, project);

    // NOTE: check if project is restricted for personal projects
    const accessCheck = await isProjectAccessible(ctx, args.projectId);

    if (!accessCheck.accessible) {
      throw new Error(
        "This project is restricted. Upgrade your plan or archive other projects to access it.",
      );
    }

    if (!(await hasProjectAccess(ctx, project))) {
      throw new Error("You do not have access to this project");
    }

    const environments = await ctx.db
      .query("environment")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    return environments
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((env) => ({
        id: env._id,
        name: env.name,
        slug: env.slug,
        description: env.description,
        color: env.color,
        sortOrder: env.sortOrder,
        createdAt: env.createdAt,
        updatedAt: env.updatedAt,
      }));
  },
});

export const getEnvironment = protectedQuery({
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

    if (project.isArchived) {
      throw new Error("This project is archived. Unarchive it to access its data.");
    }

    await checkProjectOrganizationSuspended(ctx, project);

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

    return {
      id: environment._id,
      projectId: environment.projectId,
      name: environment.name,
      slug: environment.slug,
      description: environment.description,
      color: environment.color,
      sortOrder: environment.sortOrder,
      createdBy: environment.createdBy,
      createdAt: environment.createdAt,
      updatedAt: environment.updatedAt,
    };
  },
});

export const updateEnvironment = protectedMutation({
  args: {
    environmentId: v.id("environment"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    color: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
  },
  handler: async (
    ctx: ProtectedMutationCtx,
    args: {
      environmentId: Id<"environment">;
      name?: string;
      description?: string;
      color?: string;
      sortOrder?: number;
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

    await checkProjectOrganizationSuspended(ctx, project);

    // NOTE: check if project is restricted for personal projects
    const accessCheck = await isProjectAccessible(ctx, environment.projectId);

    if (!accessCheck.accessible) {
      throw new Error(
        "This project is restricted. Upgrade your plan or archive other projects to access it.",
      );
    }

    if (!(await canAdminProject(ctx, project))) {
      throw new Error("You do not have permission to update this environment");
    }

    await checkRateLimit(ctx, "write");

    const updates: {
      updatedAt: number;
      name?: string;
      description?: string;
      color?: string;
      sortOrder?: number;
    } = { updatedAt: Date.now() };
    if (args.name !== undefined) updates.name = args.name;
    if (args.description !== undefined) updates.description = args.description;
    if (args.color !== undefined) updates.color = args.color;
    if (args.sortOrder !== undefined) updates.sortOrder = args.sortOrder;

    await ctx.db.patch(args.environmentId, updates);

    return { success: true };
  },
});

export const deleteEnvironment = protectedMutation({
  args: {
    environmentId: v.id("environment"),
  },
  handler: async (ctx: ProtectedMutationCtx, args: { environmentId: Id<"environment"> }) => {
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

    await checkProjectOrganizationSuspended(ctx, project);

    if (!(await isProjectOwner(ctx, project))) {
      throw new Error("Only project owners can delete environments");
    }

    await checkRateLimit(ctx, "delete");

    const secrets = await ctx.db
      .query("secret")
      .withIndex("by_environment", (q) => q.eq("environmentId", args.environmentId))
      .filter((q) => q.eq(q.field("isDeleted"), false))
      .first();

    if (secrets) {
      throw new Error(
        "Cannot delete environment with active secrets. Please delete all secrets first.",
      );
    }

    const folders = await ctx.db
      .query("folder")
      .withIndex("by_environment", (q) => q.eq("environmentId", args.environmentId))
      .first();

    if (folders) {
      throw new Error("Cannot delete environment with folders. Please delete all folders first.");
    }

    await ctx.db.delete(args.environmentId);

    return { success: true };
  },
});

export const reorderEnvironments = protectedMutation({
  args: {
    projectId: v.id("project"),
    environmentIds: v.array(v.id("environment")),
  },
  handler: async (
    ctx: ProtectedMutationCtx,
    args: { projectId: Id<"project">; environmentIds: Id<"environment">[] },
  ) => {
    const project = await ctx.db.get(args.projectId);

    if (!project) {
      throw new Error("Project not found");
    }

    if (project.isArchived) {
      throw new Error("This project is archived. Unarchive it to access its data.");
    }

    await checkProjectOrganizationSuspended(ctx, project);

    // NOTE: check if project is restricted for personal projects
    const accessCheck = await isProjectAccessible(ctx, args.projectId);

    if (!accessCheck.accessible) {
      throw new Error(
        "This project is restricted. Upgrade your plan or archive other projects to access it.",
      );
    }

    if (!(await canAdminProject(ctx, project))) {
      throw new Error("You do not have permission to reorder environments");
    }

    await checkRateLimit(ctx, "write");

    for (const envId of args.environmentIds) {
      const env = await ctx.db.get(envId);
      if (!env || env.projectId !== args.projectId) {
        throw new Error("Invalid environment ID or environment does not belong to this project");
      }
    }

    const now = Date.now();
    for (let i = 0; i < args.environmentIds.length; i++) {
      const envId = args.environmentIds[i];
      if (envId) {
        await ctx.db.patch(envId, {
          sortOrder: i,
          updatedAt: now,
        });
      }
    }

    return { success: true };
  },
});

export const getEnvironmentData = protectedQuery({
  args: {
    environmentId: v.id("environment"),
    includeDeleted: v.optional(v.boolean()),
    includeRecentActivity: v.optional(v.boolean()),
  },
  handler: async (
    ctx: ProtectedQueryCtx,
    args: {
      environmentId: Id<"environment">;
      includeDeleted?: boolean;
      includeRecentActivity?: boolean;
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

    await checkProjectOrganizationSuspended(ctx, project);

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
    const includeRecentActivity = args.includeRecentActivity || false;

    const [allSecrets, folders, recentActivity] = await Promise.all([
      ctx.db
        .query("secret")
        .withIndex("by_environment", (q) => q.eq("environmentId", args.environmentId))
        .collect(),
      ctx.db
        .query("folder")
        .withIndex("by_environment", (q) => q.eq("environmentId", args.environmentId))
        .collect(),
      includeRecentActivity
        ? ctx.db
            .query("secretHistory")
            .withIndex("by_project", (q) => q.eq("projectId", environment.projectId))
            .filter((q) => q.eq(q.field("environmentId"), args.environmentId))
            .order("desc")
            .take(20)
        : Promise.resolve([]),
    ]);

    const secrets = includeDeleted ? allSecrets : allSecrets.filter((s) => !s.isDeleted);

    type SecretSummary = {
      id: Id<"secret">;
      key: string;
      encryptedValue: string;
      description?: string;
      tags?: string[];
      isDeleted: boolean;
      createdBy: Id<"user">;
      createdAt: number;
      updatedBy: Id<"user">;
      updatedAt: number;
    };

    const secretsByLocation = secrets.reduce<{
      root: SecretSummary[];
      byFolder: Record<string, SecretSummary[]>;
    }>(
      (acc, secret) => {
        const summary: SecretSummary = {
          id: secret._id,
          key: secret.key,
          encryptedValue: secret.encryptedValue,
          description: secret.description,
          tags: secret.tags,
          isDeleted: secret.isDeleted,
          createdBy: secret.createdBy,
          createdAt: secret.createdAt,
          updatedBy: secret.updatedBy,
          updatedAt: secret.updatedAt,
        };

        if (secret.folderId) {
          if (!acc.byFolder[secret.folderId]) {
            acc.byFolder[secret.folderId] = [];
          }
          acc.byFolder[secret.folderId]?.push(summary);
        } else {
          acc.root.push(summary);
        }
        return acc;
      },
      { root: [], byFolder: {} },
    );

    return {
      environment: {
        id: environment._id,
        name: environment.name,
        slug: environment.slug,
        description: environment.description,
        color: environment.color,
        sortOrder: environment.sortOrder,
        createdBy: environment.createdBy,
        createdAt: environment.createdAt,
        updatedAt: environment.updatedAt,
      },
      folders: folders.map((folder) => ({
        id: folder._id,
        name: folder.name,
        slug: folder.slug,
        path: folder.path,
        description: folder.description,
        createdAt: folder.createdAt,
        updatedAt: folder.updatedAt,
        secrets: secretsByLocation.byFolder[folder._id] || [],
      })),
      rootSecrets: secretsByLocation.root,
      recentActivity: includeRecentActivity
        ? recentActivity.map((h) => ({
            id: h._id,
            secretId: h.secretId,
            key: h.key,
            action: h.action,
            changedBy: h.changedBy,
            changedAt: h.changedAt,
          }))
        : undefined,
      stats: {
        totalSecrets: secrets.length,
        totalFolders: folders.length,
        deletedSecrets: allSecrets.filter((s) => s.isDeleted).length,
      },
    };
  },
});
