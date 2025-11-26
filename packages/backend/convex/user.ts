import { v } from "convex/values";
import { components } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { protectedAction, protectedQuery } from "./lib/middleware";
import type { ProtectedActionCtx, ProtectedQueryCtx } from "./lib/types";

export const getProPlan = protectedAction({
  args: {},
  handler: async (ctx: ProtectedActionCtx) => {
    const user = await ctx.runQuery(components.betterAuth.user.loadUserById, {
      userId: ctx.userId,
    });

    const hasPro = await ctx.autumn.check(ctx, {
      featureId: "can_create_org",
    });

    if (!hasPro.data?.allowed) {
      const checkoutResult = await ctx.autumn.checkout(ctx, {
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

      const checkoutUrl = checkoutResult.data?.url || null;
      let sessionId: string | null = null;

      if (checkoutUrl) {
        const urlParts = checkoutUrl.split("/");
        const lastPart = urlParts[urlParts.length - 1];
        sessionId = lastPart?.split("?")[0] || null;
      }

      return {
        success: true,
        hasPro: false,
        checkoutLink: checkoutUrl,
        sessionId,
      };
    }

    return {
      success: true,
      hasPro: true,
      checkoutLink: null,
      sessionId: null,
    };
  },
});

export const checkProPlan = protectedAction({
  args: {},
  handler: async (ctx: ProtectedActionCtx) => {
    const hasPro = await ctx.autumn.check(ctx, {
      featureId: "can_create_org",
    });

    return { success: true, hasProPlan: hasPro.data?.allowed ?? false };
  },
});

export const getCurrentUser = protectedQuery({
  args: {},
  handler: async (ctx: ProtectedQueryCtx) => {
    const user = await ctx.runQuery(components.betterAuth.user.loadUserById, {
      userId: ctx.userId,
    });

    return user;
  },
});

export const _handlePlanUpgrade = internalMutation({
  args: {
    userId: v.id("user"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.runQuery(components.betterAuth.user.loadUserById, {
      userId: args.userId,
    });

    await ctx.runMutation(components.betterAuth.user.upgradeToPro, {
      userId: user._id,
    });
  },
});

export const _handlePlanDowngrade = internalMutation({
  args: {
    userId: v.id("user"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.runQuery(components.betterAuth.user.loadUserById, {
      userId: args.userId,
    });

    await ctx.runMutation(components.betterAuth.user.downgradeToFree, {
      userId: user._id,
    });
  },
});
