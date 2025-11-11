import { type PaginationOptions, paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { hasProjectAccess } from "./lib/access";
import { protectedQuery } from "./lib/middleware";
import {
  checkOrganizationSuspended,
  checkProjectOrganizationSuspended,
} from "./lib/organizationAccess";
import type { ProtectedQueryCtx } from "./lib/types";

async function checkResourceAccess(
  ctx: ProtectedQueryCtx,
  resourceType: "secret" | "project" | "environment" | "organization",
  resourceId: string,
): Promise<void> {
  switch (resourceType) {
    case "secret": {
      const secret = await ctx.db.get(resourceId as Id<"secret">);
      if (!secret) {
        throw new Error("Secret not found");
      }
      const project = await ctx.db.get(secret.projectId);
      if (!project) {
        throw new Error("Project not found");
      }
      await checkProjectOrganizationSuspended(ctx, project);
      if (!(await hasProjectAccess(ctx, project))) {
        throw new Error("You do not have access to view logs for this secret");
      }
      break;
    }
    case "environment": {
      const environment = await ctx.db.get(resourceId as Id<"environment">);
      if (!environment) {
        throw new Error("Environment not found");
      }
      const project = await ctx.db.get(environment.projectId);
      if (!project) {
        throw new Error("Project not found");
      }
      await checkProjectOrganizationSuspended(ctx, project);
      if (!(await hasProjectAccess(ctx, project))) {
        throw new Error("You do not have access to view logs for this environment");
      }
      break;
    }
    case "project": {
      const project = await ctx.db.get(resourceId as Id<"project">);
      if (!project) {
        throw new Error("Project not found");
      }
      await checkProjectOrganizationSuspended(ctx, project);
      if (!(await hasProjectAccess(ctx, project))) {
        throw new Error("You do not have access to view logs for this project");
      }
      break;
    }
    case "organization": {
      await checkOrganizationSuspended(ctx, resourceId);
      const membership = await ctx.db
        .query("organizationMember")
        .withIndex("by_org_and_user", (q) =>
          q.eq("organizationId", resourceId).eq("userId", ctx.userId),
        )
        .filter((q) => q.eq(q.field("revokedAt"), undefined))
        .first();

      if (!membership) {
        throw new Error("You do not have access to view logs for this organization");
      }
      break;
    }
  }
}

export const getResourceAccessLogs = protectedQuery({
  args: {
    resourceType: v.union(
      v.literal("secret"),
      v.literal("project"),
      v.literal("environment"),
      v.literal("organization"),
    ),
    resourceId: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (
    ctx: ProtectedQueryCtx,
    args: {
      paginationOpts: PaginationOptions;
      resourceType: "secret" | "project" | "environment" | "organization";
      resourceId: string;
    },
  ) => {
    // NOTE: check if user has access to view logs for this resource
    await checkResourceAccess(ctx, args.resourceType, args.resourceId);

    const result = await ctx.db
      .query("accessLog")
      .withIndex("by_resource", (q) =>
        q.eq("resourceType", args.resourceType).eq("resourceId", args.resourceId),
      )
      .order("desc")
      .paginate(args.paginationOpts);

    return {
      page: result.page.map((log) => ({
        id: log._id,
        userId: log.userId,
        action: log.action,
        ipAddress: log.ipAddress,
        userAgent: log.userAgent,
        timestamp: log.timestamp,
      })),
      continueCursor: result.continueCursor,
      isDone: result.isDone,
    };
  },
});

export const getUserAccessLogs = protectedQuery({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx: ProtectedQueryCtx, args: { paginationOpts: PaginationOptions }) => {
    // NOTE: user can always view their own access logs, so no need to checkResourceAccess
    const result = await ctx.db
      .query("accessLog")
      .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
      .order("desc")
      .paginate(args.paginationOpts);

    return {
      page: result.page.map((log) => ({
        id: log._id,
        resourceType: log.resourceType,
        resourceId: log.resourceId,
        action: log.action,
        ipAddress: log.ipAddress,
        userAgent: log.userAgent,
        timestamp: log.timestamp,
      })),
      continueCursor: result.continueCursor,
      isDone: result.isDone,
    };
  },
});
