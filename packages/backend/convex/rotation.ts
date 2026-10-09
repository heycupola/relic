import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { assertProjectAccess, isProjectAccessible } from "./lib/access";
import { createError, ErrorCode, notFoundError } from "./lib/errors";
import { generateSlug } from "./lib/helpers";
import { createLogger } from "./lib/logger";
import { protectedMutation, protectedQuery } from "./lib/middleware";
import { checkRateLimit } from "./lib/rateLimit";
import {
  compareRotationStatus,
  DAY_MS,
  inferValueChangedAt,
  isValidRotationDays,
  MAX_ROTATION_DAYS,
  MIN_ROTATION_DAYS,
} from "./lib/rotation";
import {
  computeProjectRotationEntries,
  loadKeyRotationTimestamps,
  type SecretRotationEntry,
} from "./lib/rotationData";
import {
  EmailKind,
  ErrorSeverity,
  type ProtectedMutationCtx,
  type ProtectedQueryCtx,
} from "./lib/types";
import { sendEmail } from "./resend";

const log = createLogger("rotation");

const MAX_ALERTS = 200;
const MAX_DIGEST_ITEMS = 25;
const BACKFILL_BATCH_SIZE = 200;
const DIGEST_MIN_INTERVAL_MS = 6 * DAY_MS;

const rotationStatusValidator = v.union(
  v.literal("ok"),
  v.literal("due_soon"),
  v.literal("overdue"),
  v.literal("no_policy"),
);

const rotationEntryFields = {
  secretId: v.id("secret"),
  key: v.string(),
  environmentId: v.id("environment"),
  environmentName: v.string(),
  folderId: v.union(v.id("folder"), v.null()),
  folderName: v.union(v.string(), v.null()),
  valueChangedAt: v.number(),
  ageDays: v.number(),
  rotateEveryDays: v.union(v.number(), v.null()),
  policySource: v.union(v.literal("secret"), v.literal("environment"), v.null()),
  status: rotationStatusValidator,
  dueAt: v.union(v.number(), v.null()),
  daysUntilDue: v.union(v.number(), v.null()),
};

const rotationAlertsValidator = v.object({
  items: v.array(
    v.object({
      ...rotationEntryFields,
      projectId: v.id("project"),
      projectName: v.string(),
    }),
  ),
  overdueCount: v.number(),
  dueSoonCount: v.number(),
  truncated: v.boolean(),
});

type RotationAlerts = {
  items: Array<SecretRotationEntry & { projectId: Id<"project">; projectName: string }>;
  overdueCount: number;
  dueSoonCount: number;
  truncated: boolean;
};

function sortEntries<T extends SecretRotationEntry>(entries: T[]): T[] {
  return entries.sort((a, b) => {
    const statusDiff = compareRotationStatus(a.status, b.status);
    if (statusDiff !== 0) return statusDiff;
    const dueDiff = (a.dueAt ?? Number.POSITIVE_INFINITY) - (b.dueAt ?? Number.POSITIVE_INFINITY);
    if (dueDiff !== 0) return dueDiff;
    return a.key.localeCompare(b.key);
  });
}

function assertValidRotationDays(days: number) {
  if (!isValidRotationDays(days)) {
    throw createError({
      code: ErrorCode.INVALID_ARGUMENTS,
      message: `Rotation interval must be a whole number of days between ${MIN_ROTATION_DAYS} and ${MAX_ROTATION_DAYS}`,
      severity: ErrorSeverity.Low,
    });
  }
}

async function loadUserVisibleProjects(ctx: ProtectedQueryCtx): Promise<Doc<"project">[]> {
  const owned = await ctx.db
    .query("project")
    .withIndex("by_owner", (q) => q.eq("ownerId", ctx.userId))
    .filter((q) => q.eq(q.field("isArchived"), false))
    .collect();

  const shares = await ctx.db
    .query("projectShare")
    .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
    .filter((q) => q.eq(q.field("revokedAt"), undefined))
    .collect();

  const projects = new Map<Id<"project">, Doc<"project">>(owned.map((p) => [p._id, p]));
  for (const share of shares) {
    if (projects.has(share.projectId)) continue;
    const project = await ctx.db.get(share.projectId);
    if (project && !project.isArchived) projects.set(project._id, project);
  }

  return [...projects.values()];
}

async function collectRotationAlerts(ctx: ProtectedQueryCtx, now: number): Promise<RotationAlerts> {
  const projects = await loadUserVisibleProjects(ctx);
  const items: RotationAlerts["items"] = [];

  for (const project of projects) {
    const { accessible } = await isProjectAccessible(ctx, project);
    if (!accessible) continue;

    const entries = await computeProjectRotationEntries(ctx, project._id, { now });
    for (const entry of entries) {
      if (entry.status === "overdue" || entry.status === "due_soon") {
        items.push({ ...entry, projectId: project._id, projectName: project.name });
      }
    }
  }

  sortEntries(items);

  return {
    items: items.slice(0, MAX_ALERTS),
    overdueCount: items.filter((item) => item.status === "overdue").length,
    dueSoonCount: items.filter((item) => item.status === "due_soon").length,
    truncated: items.length > MAX_ALERTS,
  };
}

export const getProjectRotationStatus = protectedQuery({
  args: {
    projectId: v.id("project"),
    environmentId: v.optional(v.id("environment")),
    attentionOnly: v.optional(v.boolean()),
  },
  returns: v.object({
    projectId: v.id("project"),
    projectName: v.string(),
    generatedAt: v.number(),
    secrets: v.array(v.object(rotationEntryFields)),
  }),
  handler: async (
    ctx: ProtectedQueryCtx,
    args: { projectId: Id<"project">; environmentId?: Id<"environment">; attentionOnly?: boolean },
  ) => {
    const project: Doc<"project"> = await ctx.runQuery(internal.project._loadProjectById, {
      projectId: args.projectId,
    });

    await assertProjectAccess(ctx, project);

    if (args.environmentId) {
      const environment = await ctx.db.get(args.environmentId);
      if (!environment || environment.projectId !== args.projectId) {
        throw notFoundError("environment");
      }
    }

    const now = Date.now();
    const entries = await computeProjectRotationEntries(ctx, args.projectId, {
      environmentId: args.environmentId,
      now,
    });

    const secrets = args.attentionOnly
      ? entries.filter((entry) => entry.status === "overdue" || entry.status === "due_soon")
      : entries;

    return {
      projectId: project._id,
      projectName: project.name,
      generatedAt: now,
      secrets: sortEntries(secrets),
    };
  },
});

export const _getRotationStatusForServiceAccount = internalQuery({
  args: {
    projectId: v.id("project"),
    environmentName: v.optional(v.string()),
  },
  returns: v.object({
    projectId: v.id("project"),
    projectName: v.string(),
    generatedAt: v.number(),
    secrets: v.array(v.object(rotationEntryFields)),
  }),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) throw notFoundError("project");

    let environmentId: Id<"environment"> | undefined;
    if (args.environmentName) {
      const slug = generateSlug(args.environmentName);
      const environment = await ctx.db
        .query("environment")
        .withIndex("by_project_and_slug", (q) => q.eq("projectId", args.projectId).eq("slug", slug))
        .first();
      if (!environment) throw notFoundError("environment");
      environmentId = environment._id;
    }

    const now = Date.now();
    const entries = await computeProjectRotationEntries(ctx, args.projectId, {
      environmentId,
      now,
    });

    return {
      projectId: project._id,
      projectName: project.name,
      generatedAt: now,
      secrets: sortEntries(entries),
    };
  },
});

export const listRotationAlerts = protectedQuery({
  args: {},
  returns: rotationAlertsValidator,
  handler: async (ctx: ProtectedQueryCtx) => {
    return await collectRotationAlerts(ctx, Date.now());
  },
});

export const setSecretRotationPolicy = protectedMutation({
  args: {
    secretId: v.id("secret"),
    rotateEveryDays: v.union(v.number(), v.null()),
  },
  returns: v.object({ success: v.boolean() }),
  handler: async (
    ctx: ProtectedMutationCtx,
    args: { secretId: Id<"secret">; rotateEveryDays: number | null },
  ) => {
    if (args.rotateEveryDays !== null) assertValidRotationDays(args.rotateEveryDays);

    const secret = await ctx.db.get(args.secretId);
    if (!secret || secret.isDeleted) {
      throw notFoundError("secret");
    }

    const project: Doc<"project"> = await ctx.runQuery(internal.project._loadProjectById, {
      projectId: secret.projectId,
    });

    await assertProjectAccess(ctx, project);

    await checkRateLimit(ctx, "write");

    const environment: Doc<"environment"> = await ctx.runQuery(
      internal.environment._loadEnvironmentById,
      { environmentId: secret.environmentId },
    );

    // Leaves updatedAt alone: legacy rows infer their value age from it.
    await ctx.db.patch(secret._id, {
      rotateEveryDays: args.rotateEveryDays ?? undefined,
    });

    await ctx.runMutation(internal.actionLog._insertActionLog, {
      projectId: project._id,
      projectName: project.name,
      userId: ctx.userId,
      action: "rotation.policy_updated",
      environmentId: environment._id,
      environmentName: environment.name,
      metadata: {
        secretId: secret._id,
        key: secret.key,
        folderId: secret.folderId,
        rotateEveryDays: args.rotateEveryDays ?? undefined,
      },
    });

    return { success: true };
  },
});

export const setEnvironmentRotationPolicy = protectedMutation({
  args: {
    environmentId: v.id("environment"),
    rotateEveryDays: v.union(v.number(), v.null()),
  },
  returns: v.object({ success: v.boolean() }),
  handler: async (
    ctx: ProtectedMutationCtx,
    args: { environmentId: Id<"environment">; rotateEveryDays: number | null },
  ) => {
    if (args.rotateEveryDays !== null) assertValidRotationDays(args.rotateEveryDays);

    const environment: Doc<"environment"> = await ctx.runQuery(
      internal.environment._loadEnvironmentById,
      { environmentId: args.environmentId },
    );

    const project: Doc<"project"> = await ctx.runQuery(internal.project._loadProjectById, {
      projectId: environment.projectId,
    });

    await assertProjectAccess(ctx, project);

    await checkRateLimit(ctx, "write");

    await ctx.db.patch(environment._id, {
      rotateEveryDays: args.rotateEveryDays ?? undefined,
    });

    await ctx.runMutation(internal.actionLog._insertActionLog, {
      projectId: project._id,
      projectName: project.name,
      userId: ctx.userId,
      action: "rotation.policy_updated",
      environmentId: environment._id,
      environmentName: environment.name,
      metadata: {
        rotateEveryDays: args.rotateEveryDays ?? undefined,
      },
    });

    return { success: true };
  },
});

export const getRotationDigestPreference = protectedQuery({
  args: {},
  returns: v.object({ enabled: v.boolean(), lastSentAt: v.union(v.number(), v.null()) }),
  handler: async (ctx: ProtectedQueryCtx) => {
    const subscription = await ctx.db
      .query("rotationDigestSubscription")
      .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
      .first();

    return { enabled: subscription !== null, lastSentAt: subscription?.lastSentAt ?? null };
  },
});

export const setRotationDigestPreference = protectedMutation({
  args: { enabled: v.boolean() },
  returns: v.object({ enabled: v.boolean() }),
  handler: async (ctx: ProtectedMutationCtx, args: { enabled: boolean }) => {
    await checkRateLimit(ctx, "write");

    const subscription = await ctx.db
      .query("rotationDigestSubscription")
      .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
      .first();

    if (args.enabled && !subscription) {
      await ctx.db.insert("rotationDigestSubscription", {
        userId: ctx.userId,
        createdAt: Date.now(),
      });
    } else if (!args.enabled && subscription) {
      await ctx.db.delete(subscription._id);
    }

    return { enabled: args.enabled };
  },
});

// Run once after deploy: `bunx convex run rotation:_backfillValueChangedAt`.
export const _backfillValueChangedAt = internalMutation({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.object({ updated: v.number(), isDone: v.boolean() }),
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("secret")
      .paginate({ cursor: args.cursor ?? null, numItems: BACKFILL_BATCH_SIZE });

    const keyRotationTimestampsByProject = new Map<Id<"project">, number[]>();
    let updated = 0;

    for (const secret of page.page) {
      if (secret.valueChangedAt !== undefined) continue;

      let keyRotationTimestamps = keyRotationTimestampsByProject.get(secret.projectId);
      if (!keyRotationTimestamps) {
        keyRotationTimestamps = await loadKeyRotationTimestamps(ctx, secret.projectId);
        keyRotationTimestampsByProject.set(secret.projectId, keyRotationTimestamps);
      }

      await ctx.db.patch(secret._id, {
        valueChangedAt: inferValueChangedAt(secret, keyRotationTimestamps),
      });
      updated++;
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.rotation._backfillValueChangedAt, {
        cursor: page.continueCursor,
      });
    }

    log.info("Backfilled valueChangedAt batch", { updated, isDone: page.isDone });

    return { updated, isDone: page.isDone };
  },
});

export const _listDigestSubscriptions = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      id: v.id("rotationDigestSubscription"),
      userId: v.string(),
      lastSentAt: v.union(v.number(), v.null()),
    }),
  ),
  handler: async (ctx) => {
    const subscriptions = await ctx.db.query("rotationDigestSubscription").collect();
    return subscriptions.map((subscription) => ({
      id: subscription._id,
      userId: subscription.userId,
      lastSentAt: subscription.lastSentAt ?? null,
    }));
  },
});

export const _loadRotationAlertsForUser = internalQuery({
  args: { userId: v.string(), now: v.number() },
  returns: rotationAlertsValidator,
  handler: async (ctx, args) => {
    const userCtx = {
      ...ctx,
      userId: args.userId,
      email: undefined,
      name: undefined,
    } as unknown as ProtectedQueryCtx;

    return await collectRotationAlerts(userCtx, args.now);
  },
});

export const _markDigestSent = internalMutation({
  args: { subscriptionId: v.id("rotationDigestSubscription"), sentAt: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const subscription = await ctx.db.get(args.subscriptionId);
    if (subscription) {
      await ctx.db.patch(subscription._id, { lastSentAt: args.sentAt });
    }
    return null;
  },
});

export const _sendWeeklyRotationDigests = internalAction({
  args: {},
  returns: v.object({ sent: v.number() }),
  handler: async (ctx) => {
    const now = Date.now();
    const subscriptions = await ctx.runQuery(internal.rotation._listDigestSubscriptions, {});
    let sent = 0;

    for (const subscription of subscriptions) {
      if (
        subscription.lastSentAt !== null &&
        now - subscription.lastSentAt < DIGEST_MIN_INTERVAL_MS
      ) {
        continue;
      }

      try {
        const user = await ctx.runQuery(components.betterAuth.user.loadUserById, {
          userId: subscription.userId,
        });
        if (!user?.email) continue;

        const alerts = await ctx.runQuery(internal.rotation._loadRotationAlertsForUser, {
          userId: subscription.userId,
          now,
        });
        if (alerts.overdueCount === 0) continue;

        const overdue = alerts.items
          .filter((item) => item.status === "overdue")
          .slice(0, MAX_DIGEST_ITEMS)
          .map((item) => ({
            key: item.key,
            projectName: item.projectName,
            environmentName: item.environmentName,
            folderName: item.folderName ?? undefined,
            ageDays: item.ageDays,
            rotateEveryDays: item.rotateEveryDays ?? 0,
          }));

        await sendEmail(ctx, user._id, user.email, {
          kind: EmailKind.RotationDigest,
          userName: user.name,
          overdue,
          overdueCount: alerts.overdueCount,
          dueSoonCount: alerts.dueSoonCount,
        });

        await ctx.runMutation(internal.rotation._markDigestSent, {
          subscriptionId: subscription.id,
          sentAt: now,
        });
        sent++;
      } catch (error) {
        log.error("Failed to send rotation digest", {
          userId: subscription.userId,
          error: String(error),
        });
      }
    }

    log.info("Rotation digest cron completed", { subscriptions: subscriptions.length, sent });

    return { sent };
  },
});
