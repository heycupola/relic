import { ConvexError, v } from "convex/values";
import { doc } from "convex-helpers/validators";
import { components, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Doc as BetterAuthDoc, Id as BetterAuthId } from "./betterAuth/_generated/dataModel";
import {
  assertOrganizationPermissions,
  assertProjectAccess,
  getUserProjectsWithRestrictions,
  isOrganizationAccessible,
  Sector,
} from "./lib/access";
import { generateSlug } from "./lib/helpers";
import { protectedAction, protectedMutation, protectedQuery } from "./lib/middleware";
import { checkRateLimit } from "./lib/rateLimit";
import {
  ErrorSeverity,
  ProjectOwner,
  type ProtectedActionCtx,
  type ProtectedMutationCtx,
  type ProtectedQueryCtx,
} from "./lib/types";
import schema from "./schema";

export const createPersonalProject = protectedAction({
  args: {
    name: v.string(),
    // description: v.optional(v.string()),
  },
  handler: async (ctx: ProtectedActionCtx, args) => {
    const { data, error } = await ctx.autumn.check(ctx, {
      featureId: "personal_projects",
    });

    if (error || !data) {
      throw new ConvexError({
        code: "PRO_PLAN_INFO_IS_NOT_REACHABLE",
        message: "Pro plan info isn't reachable",
        severity: ErrorSeverity.High,
      });
    }

    if (!data.allowed) {
      const currentUsage = data.usage || 0;

      throw new ConvexError({
        code: "PERSONAL_PROJECTS_LIMIT_REACHED",
        message: `Project limit reached. You currently have ${currentUsage} project${currentUsage !== 1 ? "s" : ""}. Purchase additional projects or upgrade your plan`,
        severity: ErrorSeverity.High,
      });
    }

    await checkRateLimit(ctx, "write");

    const { projectId } = await ctx.runMutation(internal.project._insertProject, {
      name: args.name,
      createdBy: ctx.userId,
      ownerId: ctx.userId,
      ownerType: ProjectOwner.User,
    });

    await ctx.autumn.track(ctx, {
      featureId: "personal_projects",
      value: 1,
    });

    const pId: Id<"project"> = projectId;

    return { success: true, projectId: pId };
  },
});

export const createOrganizationProject = protectedAction({
  args: {
    organizationId: v.id("organization"),
    name: v.string(),
    // description: v.optional(v.string()),
  },
  handler: async (ctx: ProtectedActionCtx, args) => {
    const organization = await ctx.runQuery(
      components.betterAuth.organization.loadOrganizationById,
      {
        organizationId: args.organizationId,
      },
    );

    if (!organization) {
      throw new ConvexError({
        code: "ORGANIZATION_NOT_FOUND",
        message: "Organization was not found with the given organization id",
        severity: ErrorSeverity.High,
      });
    }

    const { accessible } = await isOrganizationAccessible(
      organization as BetterAuthDoc<"organization">,
    );

    if (!accessible) {
      throw new ConvexError({
        code: "ORGANIZATION_IS_NOT_ACCESSIBLE",
        message: "The organization you want to create a project in is not available",
        severity: ErrorSeverity.High,
      });
    }

    await assertOrganizationPermissions(
      ctx,
      organization._id as BetterAuthId<"organization">,
      Sector.Project,
      ["create"],
    );

    const { data, error } = await ctx.autumn.check(ctx, {
      entityId: args.organizationId,
      featureId: "organization_projects",
    });

    if (error || !data) {
      throw new ConvexError({
        code: "ORGANIZATION_PROJECTS_NOT_REACHABLE",
        message: "Organization projects are not reachable",
        severity: ErrorSeverity.High,
      });
    }

    if (!data.allowed) {
      const currentUsage = data.usage || 0;

      throw new ConvexError({
        code: "ORGANIZATION_PROJECTS_LIMIT_REACHED",
        message: `Organization project limit reached. You currently have ${currentUsage} project${currentUsage !== 1 ? "s" : ""}. Purchase additional projects or upgrade your plan`,
        severity: ErrorSeverity.High,
      });
    }

    await checkRateLimit(ctx, "write");

    const { projectId } = await ctx.runMutation(internal.project._insertProject, {
      name: args.name,
      createdBy: ctx.userId,
      ownerId: args.organizationId,
      ownerType: ProjectOwner.Organization,
    });

    await ctx.autumn.track(ctx, {
      entityId: args.organizationId,
      featureId: "organization_projects",
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

export const listOrganizationProjects = protectedQuery({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx: ProtectedQueryCtx, args: { organizationId: string }) => {
    const organization = await ctx.runQuery(
      components.betterAuth.organization.loadOrganizationById,
      {
        organizationId: args.organizationId,
      },
    );

    if (!organization) {
      throw new ConvexError({
        code: "ORGANIZATION_NOT_FOUND",
        message: "Organization was not found with the given organization id",
        severity: ErrorSeverity.High,
      });
    }

    const { accessible } = await isOrganizationAccessible(
      organization as BetterAuthDoc<"organization">,
    );

    if (!accessible) {
      throw new ConvexError({
        code: "ORGANIZATION_IS_NOT_ACCESSIBLE",
        message: "The organization you want to create a project in is not available",
        severity: ErrorSeverity.High,
      });
    }

    await assertOrganizationPermissions(
      ctx,
      organization._id as BetterAuthId<"organization">,
      Sector.Project,
      ["read"],
    );

    const projects: Doc<"project">[] = await ctx.runQuery(internal.project._loadProjectsByOrgId, {
      organizationId: args.organizationId as BetterAuthId<"organization">,
    });

    return projects.map((p) => ({
      id: p._id,
      name: p.name,
      slug: p.slug,
      description: p.description,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));
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

    await assertProjectAccess(ctx, project, Sector.Project, ["read"]);

    return {
      id: project._id,
      name: project.name,
      slug: project.slug,
      description: project.description,
      ownerType: project.ownerType,
      ownerId: project.ownerId,
      isArchived: project.isArchived,
      createdBy: project.createdBy,
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

    await assertProjectAccess(ctx, project, Sector.Project, ["update"]);

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

    await assertProjectAccess(ctx, project, Sector.Project, ["delete"]);

    await checkRateLimit(ctx, "write");

    await ctx.runMutation(internal.project._archiveProject, {
      projectId: args.projectId,
    });

    if (project.ownerType === "user") {
      await ctx.autumn.track(ctx, {
        featureId: "personal_projects",
        value: -1,
      });
    } else {
      await ctx.autumn.track(ctx, {
        entityId: project.ownerId,
        featureId: "organization_projects",
        value: -1,
      });
    }

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

    await assertProjectAccess(ctx, project, Sector.Project, ["create"]);

    await checkRateLimit(ctx, "write");

    await ctx.runMutation(internal.project._unarchiveProject, {
      projectId: args.projectId,
    });

    if (project.ownerType === "user") {
      const { data, error } = await ctx.autumn.check(ctx, {
        featureId: "personal_projects",
      });

      if (error || !data) {
        throw new ConvexError({
          code: "PERSONAL_PROJECTS_DATA_INACCESSIBLE",
          message: "Personal projects are inaccessible",
          severity: ErrorSeverity.High,
        });
      }

      if (!data.allowed) {
        throw new ConvexError({
          code: "PERSONAL_PROJECTS_LIMIT_REACHED",
          message: "Personal projects limit has reached",
          severity: ErrorSeverity.High,
        });
      }

      await ctx.autumn.track(ctx, {
        featureId: "personal_projects",
        value: 1,
      });
    } else {
      const { data, error } = await ctx.autumn.check(ctx, {
        entityId: project.ownerId,
        featureId: "organization_projects",
      });

      if (error || !data) {
        throw new ConvexError({
          code: "ORGANIZATION_PROJECTS_DATA_INACCESSIBLE",
          message: "Organization projects are inaccessible",
          severity: ErrorSeverity.High,
        });
      }

      if (!data.allowed) {
        throw new ConvexError({
          code: "ORGANIZATION_PROJECTS_LIMIT_REACHED",
          message: "Organization projects limit has reached",
          severity: ErrorSeverity.High,
        });
      }

      await ctx.autumn.track(ctx, {
        entityId: project.ownerId,
        featureId: "organization_projects",
        value: 1,
      });
    }

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
      throw new ConvexError({
        code: "PROJECT_NOT_FOUND",
        message: "Project not found",
        severity: ErrorSeverity.High,
      });
    }

    return project;
  },
});

export const _loadProjects = internalQuery({
  args: {
    userId: v.id("user"),
  },
  returns: v.array(doc(schema, "project")),
  handler: async (ctx, args) => {
    const projects = await ctx.db
      .query("project")
      .withIndex("by_owner", (q) =>
        q.eq("ownerType", ProjectOwner.User).eq("ownerId", args.userId.toString()),
      )
      .filter((q) => q.eq(q.field("isArchived"), false))
      .collect();

    return projects;
  },
});

export const _loadProjectsByOrgId = internalQuery({
  args: {
    organizationId: v.id("organization"),
  },
  returns: v.array(doc(schema, "project")),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("project")
      .withIndex("by_owner", (q) =>
        q.eq("ownerType", ProjectOwner.Organization).eq("ownerId", args.organizationId.toString()),
      )
      .filter((q) => q.eq(q.field("isArchived"), false))
      .collect();
  },
});

export const _insertProject = internalMutation({
  args: {
    name: v.string(),
    // description: v.optional(v.string()),
    ownerType: v.union(v.literal(ProjectOwner.User), v.literal(ProjectOwner.Organization)),
    ownerId: v.union(v.id("user"), v.id("organization")),
    createdBy: v.id("user"),
  },
  returns: v.object({ success: v.boolean(), projectId: v.id("project") }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const slug = generateSlug(args.name);

    const existingProjects = await ctx.db
      .query("project")
      .withIndex("by_owner", (q) =>
        q.eq("ownerType", args.ownerType).eq("ownerId", args.ownerId.toString()),
      )
      .filter((q) => q.eq(q.field("isArchived"), false))
      .filter((q) => q.eq(q.field("slug"), slug))
      .collect();

    if (existingProjects.length > 0) {
      throw new ConvexError({
        code: "PROJECT_WITH_THE_SAME_SLUG_ALREADY_EXISTED",
        message: "A project with this slug already exists",
        severity: ErrorSeverity.Medium,
      });
    }

    const projectId = await ctx.db.insert("project", {
      name: args.name,
      slug,
      // description: args.description,
      ownerType: args.ownerType,
      ownerId: args.ownerId.toString(),
      isArchived: false,
      createdBy: args.createdBy,
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
