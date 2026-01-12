import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import { internalAction, internalMutation } from "./_generated/server";
import type { Id as BetterAuthId } from "./betterAuth/_generated/dataModel";
import { protectedAction, protectedQuery } from "./lib/middleware";
import { checkRateLimit } from "./lib/rateLimit";
import { EmailKind, type ProtectedActionCtx, type ProtectedQueryCtx } from "./lib/types";
import { sendEmail } from "./resend";

export const getProPlan = protectedAction({
  args: {},
  handler: async (ctx: ProtectedActionCtx) => {
    await checkRateLimit(ctx, "write");

    const user = await ctx.runQuery(components.betterAuth.user.loadUserById, {
      userId: ctx.userId,
    });

    if (!user.hasPro) {
      const checkoutResult = await ctx.autumn.checkout(ctx, {
        productId: "pro_plan",
        successUrl: `${process.env.SITE_URL || "https://relic.so"}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
        customerData: {
          name: user.name || undefined,
          email: user.email,
        },
        checkoutSessionParams: {
          cancel_url: `${process.env.SITE_URL || "https://relic.so"}/subscription/cancel`,
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
    await checkRateLimit(ctx, "read");

    const hasPro = await ctx.autumn.check(ctx, {
      featureId: "can_share_project",
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

export const getUserPublicKeyByEmail = protectedQuery({
  args: {
    email: v.string(),
  },
  returns: v.union(v.object({ publicKey: v.string() }), v.null()),
  handler: async (ctx: ProtectedQueryCtx, args: { email: string }) => {
    // First, check if requesting user has pro plan
    // Since this is a query, we need to check the user's pro status through the database
    const currentUser = await ctx.runQuery(components.betterAuth.user.loadUserById, {
      userId: ctx.userId,
    });

    if (!currentUser || !currentUser.hasPro) {
      return null;
    }

    const user = await ctx.runQuery(components.betterAuth.user.loadUserByEmail, {
      email: args.email,
    });

    if (!user || !user.publicKey) {
      return null;
    }

    return { publicKey: user.publicKey };
  },
});

export const _handlePlanUpgrade = internalAction({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.runQuery(components.betterAuth.user.loadUserById, {
      userId: args.userId,
    });

    await ctx.runMutation(components.betterAuth.user.upgradeToPro, {
      userId: user._id,
    });

    await sendEmail(ctx, user._id, user.email, {
      kind: EmailKind.PlanUpgraded,
      userName: user.name,
    });
  },
});

export const _handlePlanDowngrade = internalAction({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.runQuery(components.betterAuth.user.loadUserById, {
      userId: args.userId,
    });

    await ctx.runMutation(components.betterAuth.user.downgradeToFree, {
      userId: user._id,
    });

    await sendEmail(ctx, user._id, user.email, {
      kind: EmailKind.GracePeriodStarted,
      daysRemaining: 7,
      userName: user.name,
    });
  },
});

export const _handleEmailDelivered = internalMutation({
  args: {
    userId: v.string(),
    emailKind: v.union(
      v.literal(EmailKind.AccessRestricted),
      v.literal(EmailKind.CollaboratorAdded),
      v.literal(EmailKind.GracePeriodStarted),
      v.literal(EmailKind.PlanUpgraded),
      v.literal(EmailKind.Welcome),
    ),
    emailId: v.string(),
    deliveredAt: v.number(),
  },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args) => {
    await ctx.runMutation(components.betterAuth.user.updateUserAfterEmailSent, {
      emailKind: args.emailKind,
      userId: args.userId,
    });

    return { success: true };
  },
});

export const _handleEmailFailed = internalMutation({
  args: {
    userId: v.string(),
    emailKind: v.string(),
    reason: v.string(),
    failedAt: v.number(),
  },
  handler: async (_ctx, args) => {
    console.error(
      `[Email] Failed to deliver ${args.emailKind} to user ${args.userId}: ${args.reason}`,
    );

    // NOTE: it's enough for the MVP
    // later add retry logic, notification, log table, etc.
  },
});

export const _batchSendAccessRestrictedEmails = internalAction({
  args: {},
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, _args) => {
    const { usersToRestrict } = await ctx.runQuery(
      components.betterAuth.user.loadUsersToRestrict,
      {},
    );

    for (const user of usersToRestrict) {
      const projects = await ctx.runQuery(internal.project._loadActiveProjectsByOwner, {
        ownerId: user._id as BetterAuthId<"user">,
      });
      const projectShares = await ctx.runQuery(internal.projectShare._loadActiveSharesByUser, {
        userId: user._id as BetterAuthId<"user">,
      });

      await sendEmail(ctx, user._id, user.email, {
        kind: EmailKind.AccessRestricted,
        ownedProjectCount: projects.length,
        sharedProjectCount: projectShares.length,
        userName: user.name,
      });
    }

    return { success: true };
  },
});

export const _sendWelcomeEmail = internalAction({
  args: {
    userId: v.string(),
  },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args) => {
    const user = await ctx.runQuery(components.betterAuth.user.loadUserById, {
      userId: args.userId,
    });

    await sendEmail(ctx, user._id, user.email, {
      kind: EmailKind.Welcome,
      userName: user.name,
    });

    return { success: true };
  },
});

export const getBillingPortalUrl = protectedAction({
  args: {},
  handler: async (ctx: ProtectedActionCtx) => {
    await checkRateLimit(ctx, "read");

    try {
      const result = await ctx.autumn.customers.billingPortal(ctx, {
        returnUrl: `${process.env.SITE_URL || "https://relic.so"}/billing/return`,
      });

      return {
        success: true,
        url: result.data?.url || null,
      };
    } catch (error) {
      console.error("[getBillingPortalUrl] Failed to get billing portal URL:", error);
      return {
        success: false,
        url: null,
      };
    }
  },
});
