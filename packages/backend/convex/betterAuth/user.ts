import { v } from "convex/values";
import { doc } from "convex-helpers/validators";
import { notFoundError } from "../lib/errors";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { UserEmailType } from "./lib/types";
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

export const _loadUserById_unchecked = internalQuery({
  args: { userId: v.id("user") },
  returns: v.union(v.null(), doc(schema, "user")),
  handler: async (ctx: QueryCtx, args) => {
    return await ctx.db.get(args.userId);
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
      throw notFoundError("user");
    }

    await ctx.db.patch(args.userId, { freeOrganizationUsed: true, updatedAt: Date.now() });

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
    needsEncryptionForPersonalProjectSecrets: v.optional(v.union(v.null(), v.boolean())),
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
      needsEncryptionForPersonalProjectSecrets: args.needsEncryptionForPersonalProjectSecrets,
    });

    return { success: true };
  },
});

export const clearNeedsEncryptionForPersonalProjectSecrets = mutation({
  args: {
    userId: v.id("user"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, { needsEncryptionForPersonalProjectSecrets: undefined });
  },
});

export const _markEmailSent = internalMutation({
  args: {
    userId: v.id("user"),
    emailType: v.union(
      v.literal(UserEmailType.AccessRestricted),
      v.literal(UserEmailType.GracePeriod),
    ),
  },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args) => {
    if (args.emailType === UserEmailType.AccessRestricted) {
      await ctx.db.patch(args.userId, {
        accessRestrictedEmailSent: true,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.patch(args.userId, {
        gracePeriodEmailSent: true,
        updatedAt: Date.now(),
      });
    }

    return { success: true };
  },
});
