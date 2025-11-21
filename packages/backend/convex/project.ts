// import { v } from "convex/values";
// import type { Id } from "./_generated/dataModel";
// import { autumn } from "./autumn";
// import { canAdminProject, hasProjectAccess, isProjectOwner } from "./lib/access";
// import { protectedMutation, protectedQuery } from "./lib/middleware";
// import {
//   checkOrganizationSuspended,
//   checkProjectOrganizationSuspended,
// } from "./lib/organizationAccess";
// import { getUserProjectsWithRestrictions, isProjectAccessible } from "./lib/projectAccess";
// import { checkRateLimit } from "./lib/rateLimit";
// import type { ProtectedMutationCtx, ProtectedQueryCtx } from "./lib/types";
//
// export const createPersonalProject = protectedMutation({
//   args: {
//     name: v.string(),
//     slug: v.string(),
//     description: v.optional(v.string()),
//   },
//   handler: async (
//     ctx: ProtectedMutationCtx,
//     args: { name: string; slug: string; description?: string },
//   ) => {
//     const { data, error } = await autumn.check(ctx, {
//       featureId: "personal_projects",
//     });
//
//     if (error || !data) {
//       throw new Error(`Failed to check subscription: ${error?.message || "Unknown error"}`);
//     }
//
//     if (!data.allowed) {
//       const currentUsage = data.usage || 0;
//       throw new Error(
//         `Project limit reached. You currently have ${currentUsage} project${currentUsage !== 1 ? "s" : ""}. Purchase additional projects or upgrade your plan`,
//       );
//     }
//
//     await checkRateLimit(ctx, "write");
//
//     const existingProjects = await ctx.db
//       .query("project")
//       .withIndex("by_owner", (q) => q.eq("ownerType", "user").eq("ownerId", ctx.userId))
//       .filter((q) => q.eq(q.field("isArchived"), false))
//       .filter((q) => q.eq(q.field("slug"), args.slug))
//       .collect();
//
//     if (existingProjects.length > 0) {
//       throw new Error("A project with this slug already exists");
//     }
//
//     const now = Date.now();
//     const projectId = await ctx.db.insert("project", {
//       name: args.name,
//       slug: args.slug,
//       description: args.description,
//       ownerType: "user",
//       ownerId: ctx.userId,
//       isArchived: false,
//       createdBy: ctx.userId,
//       createdAt: now,
//       updatedAt: now,
//     });
//
//     await autumn.track(ctx, {
//       featureId: "personal_projects",
//       value: 1,
//     });
//
//     return { success: true, projectId };
//   },
// });
//
// export const createOrganizationProject = protectedMutation({
//   args: {
//     organizationId: v.string(),
//     name: v.string(),
//     slug: v.string(),
//     description: v.optional(v.string()),
//   },
//   handler: async (
//     ctx: ProtectedMutationCtx,
//     args: { organizationId: string; name: string; slug: string; description?: string },
//   ) => {
//     await checkOrganizationSuspended(ctx, args.organizationId);
//
//     const membership = await ctx.db
//       .query("organizationMember")
//       .withIndex("by_org_and_user", (q) =>
//         q.eq("organizationId", args.organizationId).eq("userId", ctx.userId),
//       )
//       .filter((q) => q.eq(q.field("revokedAt"), undefined))
//       .first();
//
//     if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
//       throw new Error("Only organization owners and admins can create projects");
//     }
//
//     const { data, error } = await autumn.check(ctx, {
//       entityId: args.organizationId,
//       featureId: "organization_projects",
//     });
//
//     if (error || !data) {
//       throw new Error(
//         `Failed to check organization subscription: ${error?.message || "Unknown error"}`,
//       );
//     }
//
//     if (!data.allowed) {
//       const currentUsage = data.usage || 0;
//       throw new Error(
//         `Organization project limit reached. You currently have ${currentUsage} project${currentUsage !== 1 ? "s" : ""}. Purchase additional projects to increase your limit.`,
//       );
//     }
//
//     await checkRateLimit(ctx, "write");
//
//     const existingProjects = await ctx.db
//       .query("project")
//       .withIndex("by_owner", (q) =>
//         q.eq("ownerType", "organization").eq("ownerId", args.organizationId),
//       )
//       .filter((q) => q.eq(q.field("isArchived"), false))
//       .filter((q) => q.eq(q.field("slug"), args.slug))
//       .collect();
//
//     if (existingProjects.length > 0) {
//       throw new Error("A project with this slug already exists in this organization");
//     }
//
//     const now = Date.now();
//     const projectId = await ctx.db.insert("project", {
//       name: args.name,
//       slug: args.slug,
//       description: args.description,
//       ownerType: "organization",
//       ownerId: args.organizationId,
//       isArchived: false,
//       createdBy: ctx.userId,
//       createdAt: now,
//       updatedAt: now,
//     });
//
//     await autumn.track(ctx, {
//       entityId: args.organizationId,
//       featureId: "organization_projects",
//       value: 1,
//     });
//
//     return { success: true, projectId };
//   },
// });
//
// export const listUserProjects = protectedQuery({
//   args: {},
//   handler: async (ctx: ProtectedQueryCtx) => {
//     // NOTE: get projects with restriction info
//     const { accessibleProjects, restrictedProjects, isInGracePeriod, gracePeriodDaysRemaining } =
//       await getUserProjectsWithRestrictions(ctx);
//
//     // NOTE: combine accessible and restricted projects
//     const allProjects = [
//       ...accessibleProjects.map((p) => ({
//         id: p._id,
//         name: p.name,
//         slug: p.slug,
//         description: p.description,
//         createdAt: p.createdAt,
//         updatedAt: p.updatedAt,
//         isRestricted: false,
//       })),
//       ...restrictedProjects.map((p) => ({
//         id: p._id,
//         name: p.name,
//         slug: p.slug,
//         description: p.description,
//         createdAt: p.createdAt,
//         updatedAt: p.updatedAt,
//         isRestricted: true,
//       })),
//     ];
//
//     return {
//       projects: allProjects,
//       isInGracePeriod,
//       gracePeriodDaysRemaining: isInGracePeriod ? gracePeriodDaysRemaining : undefined,
//     };
//   },
// });
//
// export const listOrganizationProjects = protectedQuery({
//   args: {
//     organizationId: v.string(),
//   },
//   handler: async (ctx: ProtectedQueryCtx, args: { organizationId: string }) => {
//     await checkOrganizationSuspended(ctx, args.organizationId);
//
//     const membership = await ctx.db
//       .query("organizationMember")
//       .withIndex("by_org_and_user", (q) =>
//         q.eq("organizationId", args.organizationId).eq("userId", ctx.userId),
//       )
//       .filter((q) => q.eq(q.field("revokedAt"), undefined))
//       .first();
//
//     if (!membership) {
//       throw new Error("You are not a member of this organization");
//     }
//
//     const projects = await ctx.db
//       .query("project")
//       .withIndex("by_owner", (q) =>
//         q.eq("ownerType", "organization").eq("ownerId", args.organizationId),
//       )
//       .filter((q) => q.eq(q.field("isArchived"), false))
//       .collect();
//
//     return projects.map((p) => ({
//       id: p._id,
//       name: p.name,
//       slug: p.slug,
//       description: p.description,
//       createdAt: p.createdAt,
//       updatedAt: p.updatedAt,
//     }));
//   },
// });
//
// export const getProject = protectedQuery({
//   args: {
//     projectId: v.id("project"),
//   },
//   handler: async (ctx: ProtectedQueryCtx, args: { projectId: Id<"project"> }) => {
//     const project = await ctx.db.get(args.projectId);
//
//     // NOTE: isProjectAccessible also performs the same project check
//     if (!project) {
//       throw new Error("Project not found");
//     }
//
//     await checkProjectOrganizationSuspended(ctx, project);
//
//     if (!(await hasProjectAccess(ctx, project))) {
//       throw new Error("You do not have access to this project");
//     }
//
//     // NOTE: check if project is restricted for personal projects
//     const accessCheck = await isProjectAccessible(ctx, args.projectId);
//
//     if (!accessCheck.accessible) {
//       throw new Error(
//         "This project is restricted. Upgrade your plan or archive other projects to access it.",
//       );
//     }
//
//     return {
//       id: project._id,
//       name: project.name,
//       slug: project.slug,
//       description: project.description,
//       ownerType: project.ownerType,
//       ownerId: project.ownerId,
//       isArchived: project.isArchived,
//       createdBy: project.createdBy,
//       createdAt: project.createdAt,
//       updatedAt: project.updatedAt,
//     };
//   },
// });
//
// export const updateProject = protectedMutation({
//   args: {
//     projectId: v.id("project"),
//     name: v.optional(v.string()),
//     description: v.optional(v.string()),
//   },
//   handler: async (
//     ctx: ProtectedMutationCtx,
//     args: { projectId: Id<"project">; name?: string; description?: string },
//   ) => {
//     const project = await ctx.db.get(args.projectId);
//
//     if (!project) {
//       throw new Error("Project not found");
//     }
//
//     await checkProjectOrganizationSuspended(ctx, project);
//
//     if (project.isArchived) {
//       throw new Error("Cannot update archived project. Unarchive it first.");
//     }
//
//     if (!(await canAdminProject(ctx, project))) {
//       throw new Error("You do not have permission to update this project");
//     }
//
//     // NOTE: check if project is restricted for personal projects
//     const accessCheck = await isProjectAccessible(ctx, args.projectId);
//
//     if (!accessCheck.accessible) {
//       throw new Error(
//         "This project is restricted. Upgrade your plan or archive other projects to access it.",
//       );
//     }
//
//     await checkRateLimit(ctx, "write");
//
//     const updates: {
//       updatedAt: number;
//       name?: string;
//       description?: string;
//     } = { updatedAt: Date.now() };
//     if (args.name !== undefined) updates.name = args.name;
//     if (args.description !== undefined) updates.description = args.description;
//
//     await ctx.db.patch(args.projectId, updates);
//
//     return { success: true };
//   },
// });
//
// export const archiveProject = protectedMutation({
//   args: {
//     projectId: v.id("project"),
//   },
//   handler: async (ctx: ProtectedMutationCtx, args: { projectId: Id<"project"> }) => {
//     const project = await ctx.db.get(args.projectId);
//
//     if (!project) {
//       throw new Error("Project not found");
//     }
//
//     await checkProjectOrganizationSuspended(ctx, project);
//
//     if (project.isArchived) {
//       throw new Error("Project is already archived");
//     }
//
//     if (!(await isProjectOwner(ctx, project))) {
//       throw new Error("Only project owners can archive projects");
//     }
//
//     await checkRateLimit(ctx, "delete");
//
//     await ctx.db.patch(args.projectId, { isArchived: true, updatedAt: Date.now() });
//
//     if (project.ownerType === "user") {
//       await autumn.track(ctx, {
//         featureId: "personal_projects",
//         value: -1,
//       });
//     } else {
//       await autumn.track(ctx, {
//         entityId: project.ownerId,
//         featureId: "organization_projects",
//         value: -1,
//       });
//     }
//
//     return { success: true };
//   },
// });
//
// export const unarchiveProject = protectedMutation({
//   args: {
//     projectId: v.id("project"),
//   },
//   handler: async (ctx: ProtectedMutationCtx, args: { projectId: Id<"project"> }) => {
//     const project = await ctx.db.get(args.projectId);
//
//     if (!project) {
//       throw new Error("Project not found");
//     }
//
//     await checkProjectOrganizationSuspended(ctx, project);
//
//     if (!project.isArchived) {
//       throw new Error("Project is already unarchived");
//     }
//
//     if (!(await isProjectOwner(ctx, project))) {
//       throw new Error("Only project owners can unarchive projects");
//     }
//
//     await checkRateLimit(ctx, "write");
//
//     if (project.ownerType === "user") {
//       const { data, error } = await autumn.check(ctx, {
//         featureId: "personal_projects",
//       });
//
//       if (error || !data) {
//         throw new Error(`Failed to check personal projects: ${error?.message}`);
//       }
//
//       const currentUsage = data.usage || 0;
//       if (!data.allowed) {
//         throw new Error(
//           `Project limit reached. You currently have ${currentUsage} project${currentUsage !== 1 ? "s" : ""}. Purchase additional projects or upgrade your plan.`,
//         );
//       }
//
//       await ctx.db.patch(args.projectId, { isArchived: false, updatedAt: Date.now() });
//
//       await autumn.track(ctx, {
//         featureId: "personal_projects",
//         value: 1,
//       });
//     } else {
//       const { data, error } = await autumn.check(ctx, {
//         entityId: project.ownerId,
//         featureId: "organization_projects",
//       });
//
//       if (error || !data) {
//         throw new Error(
//           `Failed to check organization projects: ${error?.message || "Unknown error"}`,
//         );
//       }
//
//       const currentUsage = data.usage || 0;
//       if (!data.allowed) {
//         throw new Error(
//           `Project limit reached. You currently have ${currentUsage} project${currentUsage !== 1 ? "s" : ""}. Purchase additional projects or upgrade your plan.`,
//         );
//       }
//
//       await ctx.db.patch(args.projectId, { isArchived: false, updatedAt: Date.now() });
//
//       await autumn.track(ctx, {
//         entityId: project.ownerId,
//         featureId: "organization_projects",
//         value: 1,
//       });
//     }
//
//     return { success: true };
//   },
// });

import { ConvexError, v } from "convex/values";
import { doc } from "convex-helpers/validators";
import { internalQuery } from "./_generated/server";
import { ErrorSeverity } from "./lib/types";
import schema from "./schema";

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
        message: "Project has not found",
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
      .withIndex("by_owner", (q) => q.eq("ownerType", "user").eq("ownerId", args.userId))
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
        q.eq("ownerType", "organization").eq("ownerId", args.organizationId),
      )
      .collect();
  },
});
