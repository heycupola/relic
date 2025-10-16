import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import { protectedMutation, protectedQuery } from "./lib/middleware";
import type { ProtectedMutationCtx, ProtectedQueryCtx } from "./lib/types";

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
      createdAt: now,
      updatedAt: now,
    });

    return userId;
  },
});

export const getUserByAuthId = internalQuery({
  args: {
    authId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("user")
      .withIndex("by_auth_id", (q) => q.eq("authId", args.authId))
      .first();

    return user;
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

export const getUser = protectedQuery({
  args: {
    userId: v.id("user"),
  },
  handler: async (ctx: ProtectedQueryCtx, args: { userId: Id<"user"> }) => {
    const user = await ctx.db.get(args.userId);

    if (!user) {
      throw new Error("User not found");
    }

    return {
      id: user._id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt,
    };
  },
});

export const getUsersByIds = protectedQuery({
  args: {
    userIds: v.array(v.id("user")),
  },
  handler: async (ctx: ProtectedQueryCtx, args: { userIds: Id<"user">[] }) => {
    const users = await Promise.all(args.userIds.map((id) => ctx.db.get(id)));

    return users
      .filter((user): user is NonNullable<typeof user> => user !== null)
      .map((user) => ({
        id: user._id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
      }));
  },
});

export const updateUserProfile = protectedMutation({
  args: {
    name: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
  },
  handler: async (ctx: ProtectedMutationCtx, args: { name?: string; avatarUrl?: string }) => {
    const user = await ctx.db.get(ctx.userId);

    if (!user) {
      throw new Error("User not found");
    }

    const updates: {
      name?: string;
      avatarUrl?: string;
      updatedAt: number;
    } = {
      updatedAt: Date.now(),
    };

    if (args.name !== undefined) updates.name = args.name;
    if (args.avatarUrl !== undefined) updates.avatarUrl = args.avatarUrl;

    await ctx.db.patch(ctx.userId, updates);

    return { success: true };
  },
});

export const searchUsersByEmail = protectedQuery({
  args: {
    email: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx: ProtectedQueryCtx, args: { email: string; limit?: number }) => {
    const limit = args.limit || 10;

    const users = await ctx.db
      .query("user")
      .withIndex("by_email")
      .filter((q) => q.eq(q.field("email"), args.email))
      .take(limit);

    return users.map((user) => ({
      id: user._id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
    }));
  },
});
