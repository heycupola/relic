import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { autumn } from "./autumn";
import { canAdminProject, hasProjectAccess, isProjectOwner } from "./lib/access";
import { protectedMutation, protectedQuery } from "./lib/middleware";
import type { ProtectedMutationCtx, ProtectedQueryCtx } from "./lib/types";

export const createPersonalProject = protectedMutation({
  args: {
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (
    ctx: ProtectedMutationCtx,
    args: { name: string; slug: string; description?: string },
  ) => {
    const { data, error } = await autumn.check(ctx, {
      featureId: "personal_projects",
    });

    if (error || !data) {
      throw new Error(`Failed to check subscription: ${error?.message || "Unknown error"}`);
    }

    const limit = data.included_usage || 2;
    const currentUsage = data.usage || 0;

    if (!data.allowed) {
      throw new Error(
        `Project limit reached (${currentUsage}/${limit}). ${limit === 2 ? "Upgrade to Pro for more projects." : "Please upgrade to add more projects."}`,
      );
    }

    const existingProjects = await ctx.db
      .query("project")
      .withIndex("by_owner", (q) => q.eq("ownerType", "user").eq("ownerId", ctx.userId))
      .filter((q) => q.eq(q.field("isArchived"), false))
      .filter((q) => q.eq(q.field("slug"), args.slug))
      .collect();

    if (existingProjects.length > 0) {
      throw new Error("A project with this slug already exists");
    }

    const now = Date.now();
    const projectId = await ctx.db.insert("project", {
      name: args.name,
      slug: args.slug,
      description: args.description,
      ownerType: "user",
      ownerId: ctx.userId,
      isArchived: false,
      createdBy: ctx.userId,
      createdAt: now,
      updatedAt: now,
    });

    await autumn.track(ctx, {
      featureId: "personal_projects",
      value: 1,
    });

    return { success: true, projectId };
  },
});

export const createOrganizationProject = protectedMutation({
  args: {
    organizationId: v.string(),
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (
    ctx: ProtectedMutationCtx,
    args: { organizationId: string; name: string; slug: string; description?: string },
  ) => {
    const membership = await ctx.db
      .query("organizationMember")
      .withIndex("by_org_and_user", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", ctx.userId),
      )
      .filter((q) => q.eq(q.field("revokedAt"), undefined))
      .first();

    if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
      throw new Error("Only organization owners and admins can create projects");
    }

    const { data, error } = await autumn.check(ctx, {
      entityId: args.organizationId,
      featureId: "organization_projects",
    });

    if (error || !data) {
      throw new Error(
        `Failed to check organization subscription: ${error?.message || "Unknown error"}`,
      );
    }

    const limit = data.included_usage || 10;
    const currentUsage = data.usage || 0;

    if (!data.allowed) {
      throw new Error(
        `Organization project limit reached (${currentUsage}/${limit}). Please upgrade to add more projects.`,
      );
    }

    const existingProjects = await ctx.db
      .query("project")
      .withIndex("by_owner", (q) =>
        q.eq("ownerType", "organization").eq("ownerId", args.organizationId),
      )
      .filter((q) => q.eq(q.field("isArchived"), false))
      .filter((q) => q.eq(q.field("slug"), args.slug))
      .collect();

    if (existingProjects.length > 0) {
      throw new Error("A project with this slug already exists in this organization");
    }

    const now = Date.now();
    const projectId = await ctx.db.insert("project", {
      name: args.name,
      slug: args.slug,
      description: args.description,
      ownerType: "organization",
      ownerId: args.organizationId,
      isArchived: false,
      createdBy: ctx.userId,
      createdAt: now,
      updatedAt: now,
    });

    await autumn.track(ctx, {
      entityId: args.organizationId,
      featureId: "organization_projects",
      value: 1,
    });

    return { success: true, projectId };
  },
});

export const listUserProjects = protectedQuery({
  args: {},
  handler: async (ctx: ProtectedQueryCtx) => {
    const projects = await ctx.db
      .query("project")
      .withIndex("by_owner", (q) => q.eq("ownerType", "user").eq("ownerId", ctx.userId))
      .filter((q) => q.eq(q.field("isArchived"), false))
      .collect();

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

export const listOrganizationProjects = protectedQuery({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx: ProtectedQueryCtx, args: { organizationId: string }) => {
    const membership = await ctx.db
      .query("organizationMember")
      .withIndex("by_org_and_user", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", ctx.userId),
      )
      .filter((q) => q.eq(q.field("revokedAt"), undefined))
      .first();

    if (!membership) {
      throw new Error("You are not a member of this organization");
    }

    const projects = await ctx.db
      .query("project")
      .withIndex("by_owner", (q) =>
        q.eq("ownerType", "organization").eq("ownerId", args.organizationId),
      )
      .filter((q) => q.eq(q.field("isArchived"), false))
      .collect();

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
    const project = await ctx.db.get(args.projectId);

    if (!project) {
      throw new Error("Project not found");
    }

    if (!(await hasProjectAccess(ctx, project))) {
      throw new Error("You do not have access to this project");
    }

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
    description: v.optional(v.string()),
  },
  handler: async (
    ctx: ProtectedMutationCtx,
    args: { projectId: Id<"project">; name?: string; description?: string },
  ) => {
    const project = await ctx.db.get(args.projectId);

    if (!project) {
      throw new Error("Project not found");
    }

    if (!(await canAdminProject(ctx, project))) {
      throw new Error("You do not have permission to update this project");
    }

    const updates: {
      updatedAt: number;
      name?: string;
      description?: string;
    } = { updatedAt: Date.now() };
    if (args.name !== undefined) updates.name = args.name;
    if (args.description !== undefined) updates.description = args.description;

    await ctx.db.patch(args.projectId, updates);

    return { success: true };
  },
});

export const archiveProject = protectedMutation({
  args: {
    projectId: v.id("project"),
  },
  handler: async (ctx: ProtectedMutationCtx, args: { projectId: Id<"project"> }) => {
    const project = await ctx.db.get(args.projectId);

    if (!project) {
      throw new Error("Project not found");
    }

    if (!(await isProjectOwner(ctx, project))) {
      throw new Error("Only project owners can archive projects");
    }

    await ctx.db.patch(args.projectId, { isArchived: true, updatedAt: Date.now() });

    if (project.ownerType === "user") {
      await autumn.track(ctx, {
        featureId: "personal_projects",
        value: -1,
      });
    } else {
      await autumn.track(ctx, {
        entityId: project.ownerId,
        featureId: "organization_projects",
        value: -1,
      });
    }

    return { success: true };
  },
});
