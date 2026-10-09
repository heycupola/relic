import { type Infer, v } from "convex/values";
import { components, internal } from "./_generated/api";
import type { Id, TableNames } from "./_generated/dataModel";
import { internalAction, internalMutation } from "./_generated/server";
import type { Id as BetterAuthId } from "./betterAuth/_generated/dataModel";
import { refreshPlan, requestUsageSync, toBillingCustomer } from "./billing";
import { autumnApi } from "./lib/autumn";
import {
  findUser,
  insertActionLog,
  listActiveOwnedProjects,
  listActiveSharesByProject,
  loadUser,
} from "./lib/data";
import { createError, ErrorCode } from "./lib/errors";
import { createLogger } from "./lib/logger";
import { protectedAction, protectedMutation, protectedQuery } from "./lib/middleware";
import { getAccessibleProjectIds, getPlanState } from "./lib/plans";
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
    // Webhook tags are untrusted input; unknown or malformed user ids are ignored.
    if (!(await findUser(ctx, args.userId))) return { success: false };

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
      const accessible = getAccessibleProjectIds(projects, getPlanState(user));
      const restricted = projects.filter((p) => !accessible.has(p._id));
      if (restricted.length === 0) continue;

      const shareCounts = await Promise.all(
        restricted.map(async (p) => (await listActiveSharesByProject(ctx, p._id)).length),
      );

      await ctx.scheduler.runAfter(0, internal.emails._send, {
        userId: user._id,
        to: user.email,
        data: {
          kind: EmailKind.AccessRestricted,
          userName: user.name,
          ownedProjectCount: restricted.length,
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

const CASCADE_BATCH_SIZE = 200;

const deletionPhase = v.union(
  v.literal("ownedProjects"),
  v.literal("sharedProjects"),
  v.literal("accountRecords"),
  v.literal("ownLogs"),
);

type DeletionPhase = Infer<typeof deletionPhase>;

const cascadeArgs = {
  userId: v.string(),
  anonymousId: v.string(),
  reason: v.union(v.literal("user_request"), v.literal("gdpr"), v.literal("admin")),
  hadProPlan: v.boolean(),
  email: v.string(),
  userName: v.string(),
  phase: v.optional(deletionPhase),
  cursor: v.optional(v.union(v.string(), v.null())),
  projectsDeleted: v.optional(v.number()),
  sharesRevoked: v.optional(v.number()),
};

/**
 * Deletes a user's data in bounded batches, rescheduling itself until nothing is left.
 * Auth records go last so a failed batch never leaves data without an owner who can retry.
 */
export const _cascadeDeleteUserData = internalMutation({
  args: cascadeArgs,
  returns: v.object({
    done: v.boolean(),
    projectsDeleted: v.number(),
    sharesRevoked: v.number(),
  }),
  handler: async (ctx, args) => {
    const { userId, anonymousId } = args;
    let budget = CASCADE_BATCH_SIZE;
    let phase: DeletionPhase = args.phase ?? "ownedProjects";
    let cursor = args.cursor ?? null;
    let projectsDeleted = args.projectsDeleted ?? 0;
    let sharesRevoked = args.sharesRevoked ?? 0;

    const deleteDocs = async (docs: { _id: Id<TableNames> }[]) => {
      for (const d of docs) await ctx.db.delete(d._id);
      budget -= docs.length;
    };

    const continueLater = async () => {
      await ctx.scheduler.runAfter(0, internal.user._cascadeDeleteUserData, {
        ...args,
        phase,
        cursor,
        projectsDeleted,
        sharesRevoked,
      });
      return { done: false, projectsDeleted, sharesRevoked };
    };

    if (phase === "ownedProjects") {
      while (budget > 0) {
        const project = await ctx.db
          .query("project")
          .withIndex("by_owner", (q) => q.eq("ownerId", userId))
          .first();
        if (!project) break;

        const projectId = project._id;
        const children = [
          (n: number) =>
            ctx.db
              .query("secret")
              .withIndex("by_project", (q) => q.eq("projectId", projectId))
              .take(n),
          (n: number) =>
            ctx.db
              .query("folder")
              .withIndex("by_project", (q) => q.eq("projectId", projectId))
              .take(n),
          (n: number) =>
            ctx.db
              .query("environment")
              .withIndex("by_project", (q) => q.eq("projectId", projectId))
              .take(n),
          (n: number) =>
            ctx.db
              .query("keyRotation")
              .withIndex("by_project", (q) => q.eq("projectId", projectId))
              .take(n),
          (n: number) =>
            ctx.db
              .query("serviceAccount")
              .withIndex("by_project", (q) => q.eq("projectId", projectId))
              .take(n),
        ];

        let drained = true;
        for (const load of children) {
          const docs = await load(budget);
          await deleteDocs(docs);
          if (budget <= 0) {
            drained = false;
            break;
          }
        }
        if (drained) {
          const shares = await ctx.db
            .query("projectShare")
            .withIndex("by_project", (q) => q.eq("projectId", projectId))
            .take(budget);
          await deleteDocs(shares);
          sharesRevoked += shares.length;
          drained = budget > 0;
        }
        if (!drained) return await continueLater();

        await ctx.db.delete(projectId);
        projectsDeleted++;
        budget--;
      }
      if (budget <= 0) return await continueLater();
      phase = "sharedProjects";
      cursor = null;
    }

    if (phase === "sharedProjects") {
      // Anonymize the owner-written logs that mention this user, then drop the share itself.
      // Convex allows a single paginated query per function, so each run handles one page.
      const share = await ctx.db
        .query("projectShare")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .first();

      if (share) {
        const page = await ctx.db
          .query("actionLog")
          .withIndex("by_project", (q) => q.eq("projectId", share.projectId))
          .paginate({ cursor, numItems: budget });
        for (const logEntry of page.page) {
          if (logEntry.metadata?.sharedUserId === userId) {
            await ctx.db.patch(logEntry._id, {
              metadata: {
                ...logEntry.metadata,
                sharedUserEmail: undefined,
                sharedUserId: anonymousId,
              },
            });
          }
        }

        if (page.isDone) {
          cursor = null;
          await ctx.db.delete(share._id);
          sharesRevoked++;

          const project = await ctx.db.get(share.projectId);
          if (project) {
            const remaining = await listActiveSharesByProject(ctx, share.projectId);
            await ctx.db.patch(share.projectId, { shareUsageCount: remaining.length });
            await requestUsageSync(ctx, project.ownerId);
          }
        } else {
          cursor = page.continueCursor;
        }
        return await continueLater();
      }

      phase = "accountRecords";
    }

    if (phase === "accountRecords") {
      const apiKeys = await ctx.db
        .query("apiKey")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .take(budget);
      await deleteDocs(apiKeys);
      if (budget <= 0) return await continueLater();

      const onboarding = await ctx.db
        .query("onboarding")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .first();
      if (onboarding) await ctx.db.delete(onboarding._id);

      const billingSync = await ctx.db
        .query("billingSync")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .unique();
      if (billingSync) await ctx.db.delete(billingSync._id);

      phase = "ownLogs";
    }

    if (phase === "ownLogs") {
      // Re-pointing userId moves each entry out of this index range, so re-reading the head is enough.
      const actionLogs = await ctx.db
        .query("actionLog")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .take(budget);
      for (const logEntry of actionLogs) {
        await ctx.db.patch(logEntry._id, {
          userId: anonymousId,
          metadata: logEntry.metadata
            ? { ...logEntry.metadata, sharedUserEmail: undefined }
            : undefined,
        });
      }
      budget -= actionLogs.length;
      if (budget <= 0) return await continueLater();
    }

    await ctx.db.insert("deletedAccount", {
      anonymousId,
      deletedAt: Date.now(),
      reason: args.reason,
      hadProPlan: args.hadProPlan,
      projectsDeleted,
      sharesRevoked,
    });
    await insertActionLog(ctx, { userId: anonymousId, action: "account.deleted" });
    await ctx.runMutation(components.betterAuth.user.deleteUserAndAuthRecords, {
      userId: userId as BetterAuthId<"user">,
    });
    await ctx.scheduler.runAfter(0, internal.user._sendAccountDeletedEmail, {
      to: args.email,
      userName: args.userName,
      projectsDeleted,
      sharesRevoked,
    });

    log.info("Account deleted", { anonymousId, projectsDeleted, sharesRevoked });
    return { done: true, projectsDeleted, sharesRevoked };
  },
});

export const _sendAccountDeletedEmail = internalAction({
  args: {
    to: v.string(),
    userName: v.string(),
    projectsDeleted: v.number(),
    sharesRevoked: v.number(),
  },
  returns: v.null(),
  handler: async (_ctx, args) => {
    try {
      await sendEmailDirect(args.to, {
        kind: EmailKind.AccountDeleted,
        userName: args.userName,
        projectsDeleted: args.projectsDeleted,
        sharesRevoked: args.sharesRevoked,
      });
    } catch (error) {
      log.error("Failed to send account deletion email", { error: String(error) });
    }
    return null;
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

        // A stale local flag shouldn't block deletion once Autumn confirms nothing is billing.
        let stillBilling = true;
        try {
          stillBilling = (await autumnApi.getSnapshot(toBillingCustomer(user))).hasActivePro;
        } catch (snapshotError) {
          log.error("Failed to verify subscription during account deletion", {
            error: String(snapshotError),
          });
        }

        if (stillBilling) {
          createError({
            code: ErrorCode.EXTERNAL_SERVICE_ERROR,
            message:
              "We couldn't cancel your Pro subscription, so your account was not deleted. Please try again in a few minutes, or cancel the subscription from the billing portal first.",
            severity: ErrorSeverity.High,
          });
        }
      }
    }

    await ctx.runMutation(internal.user._cascadeDeleteUserData, {
      userId: ctx.userId,
      anonymousId,
      reason: "user_request",
      hadProPlan: user.hasPro,
      email: user.email,
      userName: user.name || "there",
    });

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
