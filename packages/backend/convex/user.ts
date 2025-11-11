import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import { autumn, initLocalAutumn } from "./autumn";
import { protectedAction, protectedQuery } from "./lib/middleware";
import type { ProtectedQueryCtx } from "./lib/types";

export const getProPlan = protectedAction({
  args: {},
  handler: async (ctx) => {
    const user = await ctx.runQuery(internal.user.getUserById, { userId: ctx.userId });

    const localAutumnInstance = initLocalAutumn({
      customerId: user.authId,
      customerData: {
        name: user.name || undefined,
        email: user.email,
      },
    });

    const hasPro = await localAutumnInstance.check(ctx, {
      featureId: "can_create_org",
    });

    if (!hasPro.data?.allowed) {
      const checkoutResult = await localAutumnInstance.checkout(ctx, {
        productId: "pro",
        successUrl: `${process.env.SITE_URL}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
        customerData: {
          name: user.name || undefined,
          email: user.email,
        },
        checkoutSessionParams: {
          cancel_url: `${process.env.SITE_URL}/subscription/cancel`,
          metadata: {
            userId: ctx.userId,
          },
        },
      });

      return {
        success: true,
        hasPro: false,
        checkoutLink: checkoutResult.data?.url || null,
      };
    }

    return {
      success: true,
      hasPro: true,
      checkoutLink: null,
    };
  },
});

export const checkProPlan = protectedQuery({
  args: {},
  handler: async (ctx: ProtectedQueryCtx) => {
    const hasPro = await autumn.check(ctx, {
      featureId: "can_create_org",
    });

    return { success: true, hasProPlan: hasPro.data?.allowed ?? false };
  },
});

export const getUserByAuthId = internalQuery({
  args: { authId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("user")
      .withIndex("by_auth_id", (q) => q.eq("authId", args.authId))
      .first();

    if (!user) {
      throw new ConvexError({
        code: "USER_NOT_FOUND",
        message: "User not found",
        severity: "high" as const,
      });
    }

    return user;
  },
});

export const getUserById = internalQuery({
  args: { userId: v.id("user") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);

    if (!user) {
      throw new ConvexError({
        code: "USER_NOT_FOUND",
        message: "User not found",
        severity: "high" as const,
      });
    }

    return user;
  },
});

export const updateUser = internalMutation({
  args: {
    userId: v.string(),
    updates: v.object({
      email: v.optional(v.string()),
      name: v.optional(v.string()),
      updatedAt: v.number(),
    }),
  },
  handler: async (
    ctx,
    args: { userId: Id<"user">; updates: { email?: string; name?: string; updatedAt: number } },
  ) => {
    await ctx.db.patch(args.userId, args.updates);
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
      const localAutumnInstance = initLocalAutumn({
        customerId: user._id,
        customerData: {
          name: user.name,
          email: user.email,
        },
      });

      // NOTE: check current plan limit
      const { data } = await localAutumnInstance.check(ctx, {
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
