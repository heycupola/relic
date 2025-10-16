import { v } from "convex/values";
import { protectedMutation, protectedQuery } from "./lib/middleware";
import type { ProtectedMutationCtx, ProtectedQueryCtx } from "./lib/types";

export const storeUserKey = protectedMutation({
  args: {
    publicKey: v.string(),
    encryptedPrivateKey: v.string(),
    salt: v.string(),
  },
  handler: async (
    ctx: ProtectedMutationCtx,
    args: { publicKey: string; encryptedPrivateKey: string; salt: string },
  ) => {
    const existingKey = await ctx.db
      .query("userKey")
      .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
      .first();

    if (existingKey) {
      throw new Error("User keys already exist. Use updateUserKey to rotate keys.");
    }

    const now = Date.now();
    const userKeyId = await ctx.db.insert("userKey", {
      userId: ctx.userId,
      publicKey: args.publicKey,
      encryptedPrivateKey: args.encryptedPrivateKey,
      salt: args.salt,
      createdAt: now,
      updatedAt: now,
    });

    return { success: true, userKeyId };
  },
});

export const getUserKey = protectedQuery({
  args: {},
  handler: async (ctx: ProtectedQueryCtx) => {
    const userKey = await ctx.db
      .query("userKey")
      .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
      .first();

    if (!userKey) {
      return null;
    }

    return {
      id: userKey._id,
      publicKey: userKey.publicKey,
      encryptedPrivateKey: userKey.encryptedPrivateKey,
      salt: userKey.salt,
      createdAt: userKey.createdAt,
      updatedAt: userKey.updatedAt,
    };
  },
});

export const hasUserKeys = protectedQuery({
  args: {},
  handler: async (ctx: ProtectedQueryCtx) => {
    const userKey = await ctx.db
      .query("userKey")
      .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
      .first();

    return { hasKeys: !!userKey };
  },
});

export const updateUserKey = protectedMutation({
  args: {
    publicKey: v.string(),
    encryptedPrivateKey: v.string(),
    salt: v.string(),
  },
  handler: async (
    ctx: ProtectedMutationCtx,
    args: { publicKey: string; encryptedPrivateKey: string; salt: string },
  ) => {
    const existingKey = await ctx.db
      .query("userKey")
      .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
      .first();

    if (!existingKey) {
      throw new Error("No existing keys found. Use storeUserKey first.");
    }

    await ctx.db.patch(existingKey._id, {
      publicKey: args.publicKey,
      encryptedPrivateKey: args.encryptedPrivateKey,
      salt: args.salt,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});
