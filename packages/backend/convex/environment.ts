import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { canAdminProject, canWriteProject, hasProjectAccess, isProjectOwner } from "./lib/access";
import { protectedMutation, protectedQuery } from "./lib/middleware";
import type { ProtectedMutationCtx, ProtectedQueryCtx } from "./lib/types";

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

    if (!(await canWriteProject(ctx, project))) {
      throw new Error("You do not have permission to create environments");
    }

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

    if (!(await canAdminProject(ctx, project))) {
      throw new Error("You do not have permission to update this environment");
    }

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

    if (!(await isProjectOwner(ctx, project))) {
      throw new Error("Only project owners can delete environments");
    }

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

    if (!(await canAdminProject(ctx, project))) {
      throw new Error("You do not have permission to reorder environments");
    }

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
