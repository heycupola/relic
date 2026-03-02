import { v } from "convex/values";
import { doc } from "convex-helpers/validators";
import { notFoundError } from "../lib/errors";
import { EmailKind } from "../lib/types";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalQuery, mutation, query } from "./_generated/server";
import schema from "./schema";

export const loadUserById = query({
  args: { userId: v.id("user") },
  returns: doc(schema, "user"),
  handler: async (ctx: QueryCtx, args) => {
    const user = await ctx.db.get(args.userId);

    if (!user) {
      throw notFoundError("user");
    }

    return user;
  },
});

export const loadUserByEmail = query({
  args: { email: v.string() },
  returns: v.union(doc(schema, "user"), v.null()),
  handler: async (ctx: QueryCtx, args) => {
    const user = await ctx.db
      .query("user")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();

    return user || null;
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
      throw notFoundError("user");
    }

    await ctx.db.patch(args.userId, {
      hasPro: true,
      planDowngradedAt: undefined,
      gracePeriodEmailSent: undefined,
      accessRestrictedEmailSent: undefined,
      updatedAt: Date.now(),
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
      throw notFoundError("user");
    }

    const now = Date.now();
    await ctx.db.patch(args.userId, {
      hasPro: false,
      planDowngradedAt: now,
      gracePeriodEmailSent: undefined,
      accessRestrictedEmailSent: undefined,
      updatedAt: Date.now(),
    });

    // NOTE: these are for returned user value
    user.hasPro = false;
    user.planDowngradedAt = now;

    return { success: true, user };
  },
});

export const setKeysAndSalt = mutation({
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
    await ctx.db.patch(args.userId, {
      publicKey: args.publicKey,
      encryptedPrivateKey: args.encryptedPrivateKey,
      updatedAt: Date.now(),
      keysUpdatedAt: Date.now(),
      salt: args.salt,
    });

    return { success: true };
  },
});

export const updateUserAfterEmailSent = mutation({
  args: {
    userId: v.id("user"),
    emailKind: v.union(
      v.literal(EmailKind.AccessRestricted),
      v.literal(EmailKind.CollaboratorAdded),
      v.literal(EmailKind.GracePeriodStarted),
      v.literal(EmailKind.PlanUpgraded),
      v.literal(EmailKind.Welcome),
    ),
  },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args) => {
    if (args.emailKind === EmailKind.AccessRestricted) {
      await ctx.db.patch(args.userId, {
        accessRestrictedEmailSent: true,
        updatedAt: Date.now(),
      });
    } else if (args.emailKind === EmailKind.GracePeriodStarted) {
      await ctx.db.patch(args.userId, {
        gracePeriodEmailSent: true,
        updatedAt: Date.now(),
      });
    }

    // NOTE: we're not gonna handle welcome and plan upgraded for now

    return { success: true };
  },
});

export const loadUsersToRestrict = query({
  args: {},
  returns: v.object({ success: v.boolean(), usersToRestrict: v.array(doc(schema, "user")) }),
  handler: async (ctx, _args) => {
    const now = Date.now();
    const sevenDaysMs = 86_400 * 7;

    const usersToRestrict = await ctx.db
      .query("user")
      .filter((q) =>
        q.and(
          q.eq(q.field("accessRestrictedEmailSent"), false),
          q.lt(q.field("planDowngradedAt"), now - sevenDaysMs),
        ),
      )
      .collect();

    return { success: true, usersToRestrict };
  },
});

export const markOnboardingCompleted = mutation({
  args: {
    userId: v.id("user"),
  },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, { hasCompletedOnboarding: true, updatedAt: Date.now() });

    return {
      success: true,
    };
  },
});

export const _loadUserById = internalQuery({
  args: { userId: v.id("user") },
  returns: v.union(v.null(), doc(schema, "user")),
  handler: async (ctx: QueryCtx, args) => {
    return await ctx.db.get(args.userId);
  },
});
