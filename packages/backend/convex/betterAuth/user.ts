import { ConvexError, v } from "convex/values";
import { doc } from "convex-helpers/validators";
import { ErrorSeverity } from "../lib/types";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import schema from "./schema";

export const loadUserById = query({
  args: { userId: v.id("user") },
  returns: doc(schema, "user"),
  handler: async (ctx: QueryCtx, args) => {
    const user = await ctx.db.get(args.userId);

    if (!user) {
      throw new ConvexError({
        code: "USER_NOT_FOUND",
        message: "User not found",
        severity: ErrorSeverity.High,
      });
    }

    return user;
  },
});

export const useFreeOrg = mutation({
  args: {
    userId: v.id("user"),
  },
  returns: v.object({
    success: v.boolean(),
  }),
  handler: async (ctx: MutationCtx, args) => {
    const user = await ctx.db.get(args.userId);

    if (!user) {
      throw new ConvexError({
        code: "USER_NOT_FOUND",
        message: "User not found",
        severity: ErrorSeverity.High,
      });
    }

    await ctx.db.patch(args.userId, { freeOrganizationUsed: true });

    return { success: true };
  },
});

export const upgradeToPro = mutation({
  args: {
    userId: v.id("user"),
  },
  returns: v.object({
    success: v.boolean(),
    user: doc(schema, "user"),
  }),
  handler: async (ctx: MutationCtx, args) => {
    const user = await ctx.db.get(args.userId);

    if (!user) {
      throw new ConvexError({
        code: "USER_NOT_FOUND",
        message: "User not found",
        severity: ErrorSeverity.High,
      });
    }

    await ctx.db.patch(args.userId, {
      hasPro: true,
      planDowngradedAt: undefined,
    });

    user.hasPro = true;
    user.planDowngradedAt = undefined;

    return { success: true, user };
  },
});

export const downgradeToFree = mutation({
  args: {
    userId: v.id("user"),
  },
  returns: v.object({
    success: v.boolean(),
    user: doc(schema, "user"),
  }),
  handler: async (ctx: MutationCtx, args) => {
    const user = await ctx.db.get(args.userId);

    if (!user) {
      throw new ConvexError({
        code: "USER_NOT_FOUND",
        message: "User not found",
        severity: ErrorSeverity.High,
      });
    }

    const now = Date.now();
    await ctx.db.patch(args.userId, { hasPro: false, planDowngradedAt: now });

    user.hasPro = false;
    user.planDowngradedAt = now;

    return { success: true, user };
  },
});

export const setKeys = mutation({
  args: {
    userId: v.id("user"),
    publicKey: v.string(),
    encryptedPrivateKey: v.string(),
    salt: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
  }),
  handler: async (ctx: MutationCtx, args) => {
    const user = await ctx.db.get(args.userId);

    if (!user) {
      throw new ConvexError({
        code: "USER_NOT_FOUND",
        message: "User not found",
        severity: ErrorSeverity.High,
      });
    }

    await ctx.db.patch(args.userId, {
      publicKey: args.publicKey,
      encryptedPrivateKey: args.encryptedPrivateKey,
      salt: args.salt,
    });

    return { success: true };
  },
});
