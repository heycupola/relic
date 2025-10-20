import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { autumn } from "./autumn";
import { protectedQuery } from "./lib/middleware";
import type { ProtectedQueryCtx } from "./lib/types";

export const syncUserFromAuth = internalMutation({
  args: {
    authId: v.string(),
    email: v.string(),
    name: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existingUser = await ctx.db
      .query("user")
      .withIndex("by_auth_id", (q) => q.eq("authId", args.authId))
      .first();

    if (existingUser) {
      const updates: {
        email?: string;
        name?: string;
        avatarUrl?: string;
        updatedAt: number;
      } = {
        updatedAt: Date.now(),
      };

      if (existingUser.email !== args.email) updates.email = args.email;
      if (args.name && existingUser.name !== args.name) updates.name = args.name;
      if (args.avatarUrl && existingUser.avatarUrl !== args.avatarUrl) {
        updates.avatarUrl = args.avatarUrl;
      }

      if (Object.keys(updates).length > 1) {
        await ctx.db.patch(existingUser._id, updates);
      }

      return existingUser._id;
    }

    const now = Date.now();
    const userId = await ctx.db.insert("user", {
      authId: args.authId,
      email: args.email,
      name: args.name,
      avatarUrl: args.avatarUrl,
      freeOrganizationUsed: false,
      createdAt: now,
      updatedAt: now,
    });

    return userId;
  },
});

export const getCurrentUser = protectedQuery({
  args: {},
  handler: async (ctx: ProtectedQueryCtx) => {
    const user = await ctx.db.get(ctx.userId);

    if (!user) {
      throw new Error("User not found");
    }

    return {
      id: user._id,
      authId: user.authId,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  },
});

export const checkAllUserPlanStatus = internalMutation({
  args: {},
  handler: async (ctx) => {
    const allUsers = await ctx.db.query("user").collect();
    const now = Date.now();
    let usersChecked = 0;
    let downgrades = 0;
    let upgrades = 0;

    for (const user of allUsers) {
      // NOTE: check current plan limit
      const { data } = await autumn.check(ctx, {
        entityId: user._id,
        featureId: "personal_projects",
      });

      const currentLimit = data?.included_usage || 2;

      // NOTE: get user's non-archived projects
      const projects = await ctx.db
        .query("project")
        .withIndex("by_owner", (q) => q.eq("ownerType", "user").eq("ownerId", user._id))
        .filter((q) => q.eq(q.field("isArchived"), false))
        .collect();

      const projectCount = projects.length;

      // NOTE: upgrade detection - user upgraded, clear downgrade flag
      if (user.planDowngradedAt && projectCount <= currentLimit) {
        await ctx.db.patch(user._id, {
          planDowngradedAt: undefined,
          updatedAt: now,
        });
        upgrades++;
      }

      // NOTE: downgrade detection - user downgraded, set downgrade flag
      if (!user.planDowngradedAt && projectCount > currentLimit) {
        await ctx.db.patch(user._id, {
          planDowngradedAt: now,
          updatedAt: now,
        });
        downgrades++;
      }

      usersChecked++;
    }

    return {
      success: true,
      usersChecked,
      downgrades,
      upgrades,
    };
  },
});
