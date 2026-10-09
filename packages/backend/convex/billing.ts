import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import type { ActionCtx, MutationCtx } from "./_generated/server";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import type { Id as BetterAuthId } from "./betterAuth/_generated/dataModel";
import { autumnApi, type BillingCustomer } from "./lib/autumn";
import {
  findUser,
  listActiveOwnedProjects,
  listActiveSharesByProject,
  loadUser,
  type User,
} from "./lib/data";
import { createError, ErrorCode } from "./lib/errors";
import { createLogger } from "./lib/logger";
import { protectedAction, protectedQuery } from "./lib/middleware";
import {
  ADD_ON_PRICES_USD,
  BillingFeature,
  type BillingFeatureId,
  GRACE_PERIOD_DAYS,
  getPlanState,
  type PlanState,
  paidSharesFor,
} from "./lib/plans";
import { checkRateLimit } from "./lib/rateLimit";
import { EmailKind, ErrorSeverity } from "./lib/types";

const log = createLogger("billing");

const MAX_SYNC_ATTEMPTS = 6;
const STALE_SYNC_MS = 10 * 60 * 1000;

export function toBillingCustomer(user: Pick<User, "_id" | "name" | "email">): BillingCustomer {
  return { id: user._id, name: user.name, email: user.email };
}

export function requirePlanFeature(
  state: PlanState,
  feature: "canShare" | "serviceAccounts" | "apiKeys",
  message: string,
): void {
  if (!state.limits[feature]) {
    createError({
      code: ErrorCode.PRO_PLAN_REQUIRED,
      message,
      severity: ErrorSeverity.Medium,
    });
  }
}

/**
 * Marks the user's billable usage as changed and makes sure exactly one sync job is in flight.
 * Call this from any mutation that changes active projects or shares.
 */
export async function requestUsageSync(ctx: MutationCtx, userId: string): Promise<void> {
  const state = await ctx.db
    .query("billingSync")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();

  const now = Date.now();

  if (!state) {
    await ctx.db.insert("billingSync", {
      userId,
      dirty: true,
      running: true,
      attempts: 0,
      startedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.billing._syncUsage, { userId });
    return;
  }

  const isStale = state.running && (state.startedAt ?? 0) < now - STALE_SYNC_MS;
  if (state.running && !isStale) {
    if (!state.dirty) await ctx.db.patch(state._id, { dirty: true });
    return;
  }

  await ctx.db.patch(state._id, { dirty: true, running: true, attempts: 0, startedAt: now });
  await ctx.scheduler.runAfter(0, internal.billing._syncUsage, { userId });
}

export const _beginUsageSync = internalMutation({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const state = await ctx.db
      .query("billingSync")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (state) await ctx.db.patch(state._id, { dirty: false, startedAt: Date.now() });

    const user = await findUser(ctx, userId);
    if (!user) return null;

    const projects = await listActiveOwnedProjects(ctx, userId);
    let paidShares = 0;
    for (const project of projects) {
      const shares = await listActiveSharesByProject(ctx, project._id);
      paidShares += paidSharesFor(shares.length);
    }

    return {
      customer: toBillingCustomer(user),
      usage: {
        [BillingFeature.Projects]: projects.length,
        [BillingFeature.AdditionalShares]: paidShares,
      } satisfies Record<BillingFeatureId, number>,
    };
  },
});

export const _finishUsageSync = internalMutation({
  args: { userId: v.string(), error: v.optional(v.string()) },
  handler: async (ctx, { userId, error }) => {
    const state = await ctx.db
      .query("billingSync")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (!state) return;

    if (error) {
      const attempts = state.attempts + 1;
      if (attempts >= MAX_SYNC_ATTEMPTS) {
        log.error("Usage sync gave up", { userId, attempts, error });
        await ctx.db.patch(state._id, { running: false, attempts, lastError: error });
        return;
      }
      const backoffMs = Math.min(30_000 * 2 ** attempts, 60 * 60 * 1000);
      // Backoff can exceed STALE_SYNC_MS; dating the run to its retry keeps a second chain from starting.
      await ctx.db.patch(state._id, {
        attempts,
        lastError: error,
        startedAt: Date.now() + backoffMs,
      });
      await ctx.scheduler.runAfter(backoffMs, internal.billing._syncUsage, { userId });
      return;
    }

    if (state.dirty) {
      await ctx.db.patch(state._id, {
        attempts: 0,
        lastSyncedAt: Date.now(),
        startedAt: Date.now(),
      });
      await ctx.scheduler.runAfter(0, internal.billing._syncUsage, { userId });
      return;
    }

    await ctx.db.patch(state._id, {
      running: false,
      attempts: 0,
      lastSyncedAt: Date.now(),
      lastError: undefined,
    });
  },
});

/** Reconciles Autumn's recorded usage with the real counts by tracking only the difference. */
export const _syncUsage = internalAction({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const desired = await ctx.runMutation(internal.billing._beginUsageSync, { userId });
    if (!desired) {
      await ctx.runMutation(internal.billing._finishUsageSync, { userId });
      return;
    }

    try {
      const { usage: recorded } = await autumnApi.getSnapshot(desired.customer);

      for (const [featureId, target] of Object.entries(desired.usage) as [
        BillingFeatureId,
        number,
      ][]) {
        const current = recorded[featureId];
        if (current === undefined) continue;
        const delta = target - current;
        if (delta !== 0) await autumnApi.track(userId, featureId, delta);
      }

      await ctx.runMutation(internal.billing._finishUsageSync, { userId });
    } catch (error) {
      log.warn("Usage sync failed", { userId, error: String(error) });
      await ctx.runMutation(internal.billing._finishUsageSync, { userId, error: String(error) });
    }
  },
});

export const _loadCustomer = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const user = await findUser(ctx, userId);
    return user ? { customer: toBillingCustomer(user), hasPro: user.hasPro } : null;
  },
});

export const _applyPlan = internalMutation({
  args: { userId: v.string(), hasPro: v.boolean() },
  handler: async (ctx, { userId, hasPro }) => {
    const user = await findUser(ctx, userId);
    if (!user || user.hasPro === hasPro) return { changed: false };

    const userId_ = user._id as BetterAuthId<"user">;

    if (hasPro) {
      await ctx.runMutation(components.betterAuth.user.upgradeToPro, { userId: userId_ });
      await ctx.scheduler.runAfter(0, internal.emails._send, {
        userId,
        to: user.email,
        data: { kind: EmailKind.PlanUpgraded, userName: user.name },
      });
    } else {
      await ctx.runMutation(components.betterAuth.user.downgradeToFree, { userId: userId_ });
      await ctx.scheduler.runAfter(0, internal.emails._send, {
        userId,
        to: user.email,
        data: {
          kind: EmailKind.GracePeriodStarted,
          userName: user.name,
          daysRemaining: GRACE_PERIOD_DAYS,
        },
      });
    }

    await requestUsageSync(ctx, userId);
    log.info(hasPro ? "Upgraded to Pro" : "Downgraded to Free", { userId });
    return { changed: true };
  },
});

/** Pulls the customer's subscription state from Autumn and applies it locally. */
export async function refreshPlan(
  ctx: ActionCtx,
  userId: string,
): Promise<{ hasPro: boolean } | null> {
  const loaded = await ctx.runQuery(internal.billing._loadCustomer, { userId });
  if (!loaded) return null;

  const { hasActivePro } = await autumnApi.getSnapshot(loaded.customer);
  if (hasActivePro !== loaded.hasPro) {
    await ctx.runMutation(internal.billing._applyPlan, { userId, hasPro: hasActivePro });
  }
  return { hasPro: hasActivePro };
}

export const _refreshPlan = internalAction({
  args: { userId: v.string() },
  returns: v.union(v.null(), v.object({ hasPro: v.boolean() })),
  handler: async (ctx, { userId }) => refreshPlan(ctx, userId),
});

const RECONCILE_PAGE_SIZE = 50;

/** Daily safety net for missed Autumn webhooks; walks candidates page by page. */
export const _reconcilePlans = internalAction({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  returns: v.null(),
  handler: async (ctx, { cursor = null }) => {
    const page = await ctx.runQuery(components.betterAuth.user.loadPlanReconcileCandidates, {
      cursor,
      numItems: RECONCILE_PAGE_SIZE,
    });

    let failed = 0;
    for (const userId of page.userIds) {
      try {
        await refreshPlan(ctx, userId);
      } catch (error) {
        failed++;
        log.warn("Plan reconcile failed", { userId, error: String(error) });
      }
    }

    log.info("Plan reconcile page done", { checked: page.userIds.length, failed });

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.billing._reconcilePlans, {
        cursor: page.continueCursor,
      });
    }
    return null;
  },
});

type AutumnWebhookPayload = {
  type?: string;
  data?: {
    customer_id?: unknown;
    customerId?: unknown;
    customer?: { id?: unknown };
  };
};

/** Works with both legacy `customer.products.updated` and v2 `billing.updated` payloads. */
export function getWebhookCustomerId(payload: unknown): string | null {
  const data = (payload as AutumnWebhookPayload | null)?.data;
  const id = data?.customer_id ?? data?.customerId ?? data?.customer?.id;
  return typeof id === "string" && id.length > 0 && id.length < 100 ? id : null;
}

export const refreshMyPlan = protectedAction({
  args: {},
  returns: v.object({ hasPro: v.boolean() }),
  handler: async (ctx): Promise<{ hasPro: boolean }> => {
    await checkRateLimit(ctx, "read");
    const result = await refreshPlan(ctx, ctx.userId);
    return { hasPro: result?.hasPro ?? false };
  },
});

export const getBillingOverview = protectedQuery({
  args: {},
  handler: async (ctx) => {
    const user = await loadUser(ctx, ctx.userId);
    const state = getPlanState(user);
    const projects = await listActiveOwnedProjects(ctx, ctx.userId);
    const included = state.limits.includedProjects;

    return {
      plan: state.plan,
      isPro: state.isPro,
      inGracePeriod: state.inGracePeriod,
      gracePeriodDaysRemaining: state.gracePeriodDaysRemaining,
      isRestricted: state.isRestricted && projects.length > included,
      limits: state.limits,
      prices: ADD_ON_PRICES_USD,
      projects: {
        active: projects.length,
        included,
        paid: state.isPro ? Math.max(0, projects.length - included) : 0,
      },
    };
  },
});
