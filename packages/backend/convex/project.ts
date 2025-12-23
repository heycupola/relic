import { v } from "convex/values";
import { doc } from "convex-helpers/validators";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import { assertProjectAccess, getUserProjectsWithRestrictions } from "./lib/access";
import {
  alreadyExistsError,
  createError,
  ErrorCode,
  limitReachedError,
  notFoundError,
} from "./lib/errors";
import { generateSlug } from "./lib/helpers";
import { protectedAction, protectedMutation, protectedQuery } from "./lib/middleware";
import { checkRateLimit } from "./lib/rateLimit";
import {
  ErrorSeverity,
  type ProtectedActionCtx,
  type ProtectedMutationCtx,
  type ProtectedQueryCtx,
} from "./lib/types";
import schema from "./schema";

export const createProject = protectedAction({
  args: {
    name: v.string(),
    // description: v.optional(v.string()),
    encryptedProjectKey: v.string(),
  },
  handler: async (ctx: ProtectedActionCtx, args) => {
    await checkRateLimit(ctx, "write");

    const { data, error } = await ctx.autumn.check(ctx, {
      featureId: "projects",
    });

    if (error || !data) {
      throw createError({
        code: ErrorCode.EXTERNAL_SERVICE_ERROR,
        message: "Pro plan info isn't reachable",
        severity: ErrorSeverity.High,
      });
    }

    if (!data.allowed) {
      const currentUsage = data.usage || 0;

      throw limitReachedError("projects", currentUsage, data.included_usage, ErrorSeverity.High);
    }

    const { projectId } = await ctx.runMutation(internal.project._insertProject, {
      name: args.name,
      createdBy: ctx.userId,
      ownerId: ctx.userId,
      encryptedProjectKey: args.encryptedProjectKey,
    });

    await ctx.autumn.track(ctx, {
      featureId: "projects",
      value: 1,
    });

    const pId: Id<"project"> = projectId;

    return { success: true, projectId: pId };
  },
});

export const listUserProjects = protectedQuery({
  args: {},
  handler: async (ctx: ProtectedQueryCtx) => {
    const { accessibleProjects, restrictedProjects, isInGracePeriod, gracePeriodDaysRemaining } =
      await getUserProjectsWithRestrictions(ctx);

    // NOTE: combine accessible and restricted projects
    const allProjects = [
      ...accessibleProjects.map((p) => ({
        id: p._id,
        name: p.name,
        slug: p.slug,
        description: p.description,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        isRestricted: false,
      })),
      ...restrictedProjects.map((p) => ({
        id: p._id,
        name: p.name,
        slug: p.slug,
        description: p.description,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        isRestricted: true,
      })),
    ];

    return {
      projects: allProjects,
      isInGracePeriod,
      gracePeriodDaysRemaining: isInGracePeriod ? gracePeriodDaysRemaining : undefined,
    };
  },
});

export const getProject = protectedQuery({
  args: {
    projectId: v.id("project"),
  },
  handler: async (ctx: ProtectedQueryCtx, args: { projectId: Id<"project"> }) => {
    const project: Doc<"project"> = await ctx.runQuery(internal.project._loadProjectById, {
      projectId: args.projectId,
    });

    await assertProjectAccess(ctx, project);

    return {
      id: project._id,
      name: project.name,
      slug: project.slug,
      description: project.description,
      ownerId: project.ownerId,
      isArchived: project.isArchived,
      keyVersion: project.keyVersion,
      encryptedProjectKey: project.encryptedProjectKey,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    };
  },
});

export const updateProject = protectedMutation({
  args: {
    projectId: v.id("project"),
    name: v.optional(v.string()),
    // description: v.optional(v.string()),
  },
  handler: async (ctx: ProtectedMutationCtx, args) => {
    const project: Doc<"project"> = await ctx.runQuery(internal.project._loadProjectById, {
      projectId: args.projectId,
    });

    await assertProjectAccess(ctx, project);

    await checkRateLimit(ctx, "write");

    await ctx.runMutation(internal.project._updateProject, {
      projectId: args.projectId,
      updates: {
        name: args.name,
      },
    });

    return { success: true };
  },
});

export const archiveProject = protectedAction({
  args: {
    projectId: v.id("project"),
  },
  handler: async (ctx: ProtectedActionCtx, args) => {
    const project: Doc<"project"> = await ctx.runQuery(internal.project._loadProjectById, {
      projectId: args.projectId,
    });

    await assertProjectAccess(ctx, project);

    await checkRateLimit(ctx, "write");

    await ctx.runMutation(internal.project._archiveProject, {
      projectId: args.projectId,
    });

    await ctx.autumn.track(ctx, {
      featureId: "projects",
      value: -1,
    });

    return { success: true };
  },
});

export const unarchiveProject = protectedAction({
  args: {
    projectId: v.id("project"),
  },
  handler: async (ctx: ProtectedActionCtx, args) => {
    const project: Doc<"project"> = await ctx.runQuery(internal.project._loadProjectById, {
      projectId: args.projectId,
    });

    await assertProjectAccess(ctx, project, { skipArchivedCheck: true });

    await checkRateLimit(ctx, "write");

    await ctx.runMutation(internal.project._unarchiveProject, {
      projectId: args.projectId,
    });

    const { data, error } = await ctx.autumn.check(ctx, {
      featureId: "projects",
    });

    if (error || !data) {
      throw createError({
        code: ErrorCode.EXTERNAL_SERVICE_ERROR,
        message: "Personal projects are inaccessible",
        severity: ErrorSeverity.High,
      });
    }

    if (!data.allowed) {
      throw limitReachedError("projects", data.usage, data.included_usage, ErrorSeverity.High);
    }

    await ctx.autumn.track(ctx, {
      featureId: "projects",
      value: 1,
    });

    return { success: true };
  },
});

export const _loadProjectById = internalQuery({
  args: {
    projectId: v.id("project"),
  },
  returns: doc(schema, "project"),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);

    if (!project) {
      throw notFoundError("project");
    }

    return project;
  },
});

export const _loadActiveProjectsByOwner = internalQuery({
  args: {
    ownerId: v.id("user"),
  },
  returns: v.array(doc(schema, "project")),
  handler: async (ctx, args) => {
    const projects = await ctx.db
      .query("project")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId.toString()))
      .filter((q) => q.eq(q.field("isArchived"), false))
      .collect();

    return projects;
  },
});

export const _insertProject = internalMutation({
  args: {
    name: v.string(),
    // description: v.optional(v.string()),
    ownerId: v.id("user"),
    encryptedProjectKey: v.string(),
    createdBy: v.id("user"),
  },
  returns: v.object({ success: v.boolean(), projectId: v.id("project") }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const slug = generateSlug(args.name);

    const existingProjects = await ctx.db
      .query("project")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId.toString()))
      .filter((q) => q.eq(q.field("isArchived"), false))
      .filter((q) => q.eq(q.field("slug"), slug))
      .collect();

    if (existingProjects.length > 0) {
      throw alreadyExistsError("project", ErrorSeverity.Medium);
    }

    const projectId = await ctx.db.insert("project", {
      name: args.name,
      slug,
      // description: args.description,
      ownerId: args.ownerId.toString(),
      encryptedProjectKey: args.encryptedProjectKey,
      keyVersion: 1,
      isArchived: false,
      createdAt: now,
      updatedAt: now,
    });

    return { success: true, projectId };
  },
});

export const _updateProject = internalMutation({
  args: {
    projectId: v.id("project"),
    updates: v.object({
      name: v.optional(v.string()),
      // description: v.string(),
    }),
  },
  returns: v.object({
    success: v.boolean(),
  }),
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
      // if (args.description !== undefined) updates.description = args.description;
    }

    await ctx.db.patch(args.projectId, updates);

    return { success: true };
  },
});

export const _archiveProject = internalMutation({
  args: {
    projectId: v.id("project"),
  },
  returns: v.object({
    success: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.projectId, { isArchived: true, updatedAt: Date.now() });

    return { success: true };
  },
});

export const _unarchiveProject = internalMutation({
  args: {
    projectId: v.id("project"),
  },
  returns: v.object({
    success: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.projectId, { isArchived: false, updatedAt: Date.now() });

    return { success: true };
  },
});

export const _rotateProjectKey = internalMutation({
  args: {
    projectId: v.id("project"),
    newEncryptedProjectKey: v.string(),
    newKeyVersion: v.number(),
  },
  returns: v.object({
    success: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.projectId, {
      encryptedProjectKey: args.newEncryptedProjectKey,
      keyVersion: args.newKeyVersion,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});
