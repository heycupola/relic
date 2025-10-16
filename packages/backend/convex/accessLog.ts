import { v } from "convex/values";
import { protectedQuery } from "./lib/middleware";
import type { ProtectedQueryCtx } from "./lib/types";

export const getAccessLogs = protectedQuery({
  args: {
    resourceType: v.optional(
      v.union(
        v.literal("secret"),
        v.literal("project"),
        v.literal("environment"),
        v.literal("organization"),
      ),
    ),
    resourceId: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (
    ctx: ProtectedQueryCtx,
    args: {
      resourceType?: "secret" | "project" | "environment" | "organization";
      resourceId?: string;
      limit?: number;
    },
  ) => {
    const limit = args.limit || 100;

    const logs = await (async () => {
      if (args.resourceType && args.resourceId) {
        return ctx.db
          .query("accessLog")
          .withIndex("by_resource", (q) =>
            q.eq("resourceType", args.resourceType).eq("resourceId", args.resourceId),
          )
          .order("desc")
          .take(limit);
      }
      if (args.resourceType) {
        return ctx.db
          .query("accessLog")
          .withIndex("by_resource", (q) => q.eq("resourceType", args.resourceType))
          .order("desc")
          .take(limit);
      }
      return ctx.db
        .query("accessLog")
        .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
        .order("desc")
        .take(limit);
    })();

    return logs.map((log) => ({
      id: log._id,
      userId: log.userId,
      resourceType: log.resourceType,
      resourceId: log.resourceId,
      action: log.action,
      ipAddress: log.ipAddress,
      userAgent: log.userAgent,
      timestamp: log.timestamp,
    }));
  },
});

export const getResourceAccessLogs = protectedQuery({
  args: {
    resourceType: v.union(
      v.literal("secret"),
      v.literal("project"),
      v.literal("environment"),
      v.literal("organization"),
    ),
    resourceId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (
    ctx: ProtectedQueryCtx,
    args: {
      resourceType: "secret" | "project" | "environment" | "organization";
      resourceId: string;
      limit?: number;
    },
  ) => {
    const limit = args.limit || 50;

    const logs = await ctx.db
      .query("accessLog")
      .withIndex("by_resource", (q) =>
        q.eq("resourceType", args.resourceType).eq("resourceId", args.resourceId),
      )
      .order("desc")
      .take(limit);

    return logs.map((log) => ({
      id: log._id,
      userId: log.userId,
      action: log.action,
      ipAddress: log.ipAddress,
      userAgent: log.userAgent,
      timestamp: log.timestamp,
    }));
  },
});

export const getUserAccessLogs = protectedQuery({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx: ProtectedQueryCtx, args: { limit?: number }) => {
    const limit = args.limit || 100;

    const logs = await ctx.db
      .query("accessLog")
      .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
      .order("desc")
      .take(limit);

    return logs.map((log) => ({
      id: log._id,
      resourceType: log.resourceType,
      resourceId: log.resourceId,
      action: log.action,
      ipAddress: log.ipAddress,
      userAgent: log.userAgent,
      timestamp: log.timestamp,
    }));
  },
});
