import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import type { Id, TableNames } from "./_generated/dataModel";
import { internalAction, internalMutation } from "./_generated/server";
import type { Id as BetterAuthId } from "./betterAuth/_generated/dataModel";
import { refreshPlan, requestUsageSync, toBillingCustomer } from "./billing";
import { autumnApi } from "./lib/autumn";
import {
  insertActionLog,
  listActiveOwnedProjects,
  listActiveSharesByProject,
  loadUser,
} from "./lib/data";
import { createError, ErrorCode } from "./lib/errors";
import { createLogger } from "./lib/logger";
import { protectedAction, protectedMutation, protectedQuery } from "./lib/middleware";
import { PLANS } from "./lib/plans";
import { checkRateLimit } from "./lib/rateLimit";
import { EmailKind, ErrorSeverity } from "./lib/types";
import { sendEmail, sendEmailDirect } from "./resend";

const log = createLogger("user");

export const getProPlan = protectedAction({
  args: {},
  handler: async (ctx) => {
    await checkRateLimit(ctx, "write");

    const refreshed = await refreshPlan(ctx, ctx.userId);
    if (refreshed?.hasPro) {
      return { success: true, hasPro: true, checkoutLink: null, sessionId: null };
    }

    const user = await ctx.runQuery(components.betterAuth.user.loadUserById, {
      userId: ctx.userId,
    });
    const checkoutLink = await autumnApi.createProCheckoutUrl(toBillingCustomer(user));

    return { success: true, hasPro: false, checkoutLink, sessionId: null };
  },
});

export const checkProPlan = protectedAction({
  args: {},
  handler: async (ctx) => {
    await checkRateLimit(ctx, "read");
    const user = await ctx.runQuery(components.betterAuth.user.loadUserById, {
      userId: ctx.userId,
    });
    return { success: true, hasProPlan: user.hasPro };
  },
});

export const getCurrentUser = protectedQuery({
  args: {},
  handler: async (ctx) => {
    const user = await loadUser(ctx, ctx.userId);

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
  args: { email: v.string() },
  returns: v.union(v.object({ publicKey: v.string() }), v.null()),
  handler: async (ctx, args) => {
    const currentUser = await loadUser(ctx, ctx.userId);
    if (!currentUser.hasPro) return null;

    const user = await ctx.runQuery(components.betterAuth.user.loadUserByEmail, {
      email: args.email.trim(),
    });
    return user?.publicKey ? { publicKey: user.publicKey } : null;
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
    const user = await loadUser(ctx, ctx.userId);

    const onboarding = await ctx.db
      .query("onboarding")
      .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
      .first();

    if (onboarding !== null || user.hasCompletedOnboarding === true) {
      createError({
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
      sourceOther: args.sourceOther?.trim() || undefined,
    });

    await ctx.runMutation(components.betterAuth.user.markOnboardingCompleted, {
      userId: ctx.userId,
    });

    await insertActionLog(ctx, { action: "onboarding.completed", userId: ctx.userId });

    return { success: true };
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
      userId: args.userId as BetterAuthId<"user">,
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
  },
});

/** Notifies users whose grace period ended and who now have restricted projects. */
export const _queueAccessRestrictedEmails = internalMutation({
  args: {},
  returns: v.object({ queued: v.number() }),
  handler: async (ctx) => {
    const { usersToRestrict } = await ctx.runQuery(
      components.betterAuth.user.loadUsersToRestrict,
      {},
    );

    let queued = 0;
    for (const user of usersToRestrict) {
      await ctx.runMutation(components.betterAuth.user.markAccessRestrictedEmailSent, {
        userId: user._id,
      });

      const projects = await listActiveOwnedProjects(ctx, user._id);
      if (projects.length <= PLANS.free.includedProjects) continue;

      const shareCounts = await Promise.all(
        projects.map(async (p) => (await listActiveSharesByProject(ctx, p._id)).length),
      );

      await ctx.scheduler.runAfter(0, internal.emails._send, {
        userId: user._id,
        to: user.email,
        data: {
          kind: EmailKind.AccessRestricted,
          userName: user.name,
          ownedProjectCount: projects.length,
          sharedProjectCount: shareCounts.filter((count) => count > 0).length,
        },
      });
      queued++;
    }

    log.info("Access restriction emails queued", {
      checked: usersToRestrict.length,
      queued,
    });
    return { queued };
  },
});

export const _sendWelcomeEmail = internalAction({
  args: { userId: v.string() },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args) => {
    const user = await ctx.runQuery(components.betterAuth.user.loadUserById, {
      userId: args.userId as BetterAuthId<"user">,
    });

    await sendEmail(ctx, user._id, user.email, {
      kind: EmailKind.Welcome,
      userName: user.name,
    });

    return { success: true };
  },
});

export const _cascadeDeleteUserData = internalMutation({
  args: {
    userId: v.string(),
    anonymousId: v.string(),
    reason: v.union(v.literal("user_request"), v.literal("gdpr"), v.literal("admin")),
    hadProPlan: v.boolean(),
  },
  returns: v.object({
    success: v.boolean(),
    projectsDeleted: v.number(),
    sharesRevoked: v.number(),
  }),
  handler: async (ctx, args) => {
    let projectsDeleted = 0;
    let sharesRevoked = 0;

    const deleteAll = async (docs: { _id: Id<TableNames> }[]) => {
      await Promise.all(docs.map((d) => ctx.db.delete(d._id)));
      return docs.length;
    };

    const ownedProjects = await ctx.db
      .query("project")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.userId))
      .collect();

    for (const project of ownedProjects) {
      const projectId = project._id;
      const [secrets, folders, environments, rotations, serviceAccounts, shares] =
        await Promise.all([
          ctx.db
            .query("secret")
            .withIndex("by_project", (q) => q.eq("projectId", projectId))
            .collect(),
          ctx.db
            .query("folder")
            .withIndex("by_project", (q) => q.eq("projectId", projectId))
            .collect(),
          ctx.db
            .query("environment")
            .withIndex("by_project", (q) => q.eq("projectId", projectId))
            .collect(),
          ctx.db
            .query("keyRotation")
            .withIndex("by_project", (q) => q.eq("projectId", projectId))
            .collect(),
          ctx.db
            .query("serviceAccount")
            .withIndex("by_project", (q) => q.eq("projectId", projectId))
            .collect(),
          ctx.db
            .query("projectShare")
            .withIndex("by_project", (q) => q.eq("projectId", projectId))
            .collect(),
        ]);

      await deleteAll([...secrets, ...folders, ...environments, ...rotations, ...serviceAccounts]);
      sharesRevoked += await deleteAll(shares);

      await ctx.db.delete(projectId);
      projectsDeleted++;
    }

    const sharedWithMe = await ctx.db
      .query("projectShare")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    sharesRevoked += await deleteAll(sharedWithMe);

    const affectedProjectIds = [...new Set(sharedWithMe.map((s) => s.projectId))];
    const affectedOwners = new Set<string>();
    for (const projectId of affectedProjectIds) {
      const project = await ctx.db.get(projectId);
      if (!project) continue;
      const remaining = await listActiveSharesByProject(ctx, projectId);
      await ctx.db.patch(projectId, { shareUsageCount: remaining.length });
      affectedOwners.add(project.ownerId);
    }
    for (const ownerId of affectedOwners) {
      await requestUsageSync(ctx, ownerId);
    }

    const onboarding = await ctx.db
      .query("onboarding")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (onboarding) await ctx.db.delete(onboarding._id);

    await deleteAll(
      await ctx.db
        .query("apiKey")
        .withIndex("by_user", (q) => q.eq("userId", args.userId))
        .collect(),
    );

    const billingSync = await ctx.db
      .query("billingSync")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
    if (billingSync) await ctx.db.delete(billingSync._id);

    const actionLogs = await ctx.db
      .query("actionLog")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    for (const logEntry of actionLogs) {
      await ctx.db.patch(logEntry._id, {
        userId: args.anonymousId,
        metadata: logEntry.metadata
          ? { ...logEntry.metadata, sharedUserEmail: undefined }
          : undefined,
      });
    }

    for (const projectId of affectedProjectIds) {
      const projectLogs = await ctx.db
        .query("actionLog")
        .withIndex("by_project", (q) => q.eq("projectId", projectId))
        .collect();

      for (const logEntry of projectLogs) {
        if (logEntry.metadata?.sharedUserId === args.userId) {
          await ctx.db.patch(logEntry._id, {
            metadata: {
              ...logEntry.metadata,
              sharedUserEmail: undefined,
              sharedUserId: args.anonymousId,
            },
          });
        }
      }
    }

    await ctx.db.insert("deletedAccount", {
      anonymousId: args.anonymousId,
      deletedAt: Date.now(),
      reason: args.reason,
      hadProPlan: args.hadProPlan,
      projectsDeleted,
      sharesRevoked,
    });

    return { success: true, projectsDeleted, sharesRevoked };
  },
});

export const deleteAccount = protectedAction({
  args: {},
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx) => {
    await checkRateLimit(ctx, "write");

    const user = await ctx.runQuery(components.betterAuth.user.loadUserById, {
      userId: ctx.userId,
    });

    const anonymousId = `deleted-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

    if (user.hasPro) {
      try {
        await autumnApi.cancelProImmediately(ctx.userId);
      } catch (error) {
        log.error("Failed to cancel subscription during account deletion", {
          error: String(error),
        });
      }
    }

    const cascadeResult = await ctx.runMutation(internal.user._cascadeDeleteUserData, {
      userId: ctx.userId,
      anonymousId,
      reason: "user_request",
      hadProPlan: user.hasPro,
    });

    try {
      await sendEmailDirect(user.email, {
        kind: EmailKind.AccountDeleted,
        userName: user.name || "there",
        projectsDeleted: cascadeResult.projectsDeleted,
        sharesRevoked: cascadeResult.sharesRevoked,
      });
    } catch (error) {
      log.error("Failed to send account deletion email", { error: String(error) });
    }

    await ctx.runMutation(internal.actionLog._insertActionLog, {
      userId: anonymousId,
      action: "account.deleted",
    });

    await ctx.runMutation(components.betterAuth.user.deleteUserAndAuthRecords, {
      userId: ctx.userId,
    });

    log.info("Account deleted", { anonymousId });

    return { success: true };
  },
});

export const getBillingPortalUrl = protectedAction({
  args: {},
  handler: async (ctx) => {
    await checkRateLimit(ctx, "read");

    try {
      return { success: true, url: await autumnApi.createPortalUrl(ctx.userId) };
    } catch (error) {
      log.error("Failed to get billing portal URL", { error: String(error) });
      return { success: false, url: null };
    }
  },
});
