import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import { internalAction, internalMutation } from "./_generated/server";
import type { Id as BetterAuthId } from "./betterAuth/_generated/dataModel";
import { createError, ErrorCode } from "./lib/errors";
import { createLogger } from "./lib/logger";
import { protectedAction, protectedMutation, protectedQuery } from "./lib/middleware";
import { checkRateLimit } from "./lib/rateLimit";
import {
  EmailKind,
  ErrorSeverity,
  type ProtectedActionCtx,
  type ProtectedQueryCtx,
} from "./lib/types";
import { sendEmail } from "./resend";

const log = createLogger("user");

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

    return {
      id: user._id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      image: user.image,
      hasPro: user.hasPro,
      publicKey: user.publicKey,
      encryptedPrivateKey: user.encryptedPrivateKey,
      salt: user.salt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      keysUpdatedAt: user.keysUpdatedAt,
      hasCompletedOnboarding: user.hasCompletedOnboarding,
    };
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

export const completeOnboarding = protectedMutation({
  args: {
    source: v.optional(
      v.union(
        v.literal("google_search"),
        v.literal("github"),
        v.literal("reddit"),
        v.literal("x"),
        v.literal("youtube"),
        v.literal("discord"),
        v.literal("friend"),
        v.literal("blog_post"),
        v.literal("other"),
      ),
    ),
    sourceOther: v.optional(v.string()),
    teamSize: v.optional(
      v.union(
        v.literal("1"),
        v.literal("2-5"),
        v.literal("6-20"),
        v.literal("21-50"),
        v.literal("50+"),
        v.literal("other"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const user = await ctx.runQuery(components.betterAuth.user.loadUserById, {
      userId: ctx.userId,
    });

    const onboarding = await ctx.db
      .query("onboarding")
      .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
      .first();

    if (onboarding !== null || user.hasCompletedOnboarding === true) {
      throw createError({
        code: ErrorCode.UNABLE_TO_PERFORM_THIS_ACTION,
        message: "Onboarding is already completed",
        severity: ErrorSeverity.Low,
      });
    }

    await ctx.db.insert("onboarding", {
      userId: ctx.userId,
      createdAt: Date.now(),
      teamSize: args.teamSize,
      source: args.source,
      sourceOther: args.sourceOther,
    });

    await ctx.runMutation(components.betterAuth.user.markOnboardingCompleted, {
      userId: ctx.userId,
    });

    await ctx.runMutation(internal.actionLog._insertActionLog, {
      action: "onboarding.completed",
      userId: ctx.userId,
    });

    return { success: true };
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

    log.info("User upgraded to Pro", { userId: user._id });

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

    log.info("User downgraded to Free, grace period started", { userId: user._id });

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
    log.error("Failed to deliver email", {
      emailKind: args.emailKind,
      userId: args.userId,
      reason: args.reason,
    });

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

    log.info("Access restriction cron started", { usersToRestrict: usersToRestrict.length });

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

    log.info("Access restriction cron completed", { processed: usersToRestrict.length });

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
        returnUrl: `${process.env.SITE_URL || "https://relic.so"}/dashboard`,
      });

      return {
        success: true,
        url: result.data?.url || null,
      };
    } catch (error) {
      log.error("Failed to get billing portal URL", { error: String(error) });
      return {
        success: false,
        url: null,
      };
    }
  },
});
