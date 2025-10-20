import type { Doc, Id } from "../_generated/dataModel";
import { autumn } from "../autumn";
import type { ProtectedMutationCtx, ProtectedQueryCtx } from "./types";

const GRACE_PERIOD_DAYS = 7;
const GRACE_PERIOD_MS = GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000;

// NOTE: context type with request-level cache
type CtxWithCache = (ProtectedQueryCtx | ProtectedMutationCtx) & {
  _projectAccessCache?: Map<string, boolean>;
  _userProjectsCache?: {
    accessibleProjects: Doc<"project">[];
    restrictedProjects: Doc<"project">[];
    isInGracePeriod: boolean;
    gracePeriodDaysRemaining: number;
  };
};

// NOTE: get or create cache for current request
function getAccessCache(ctx: CtxWithCache): Map<string, boolean> {
  if (!ctx._projectAccessCache) {
    ctx._projectAccessCache = new Map();
  }
  return ctx._projectAccessCache;
}

// NOTE: clear all caches in context (call when plan changes)
function clearAccessCache(ctx: CtxWithCache): void {
  if (ctx._projectAccessCache) {
    ctx._projectAccessCache.clear();
  }
  ctx._userProjectsCache = undefined;
}

// NOTE: check if user is within grace period after plan downgrade
export function isInGracePeriod(user: Doc<"user">): boolean {
  if (!user.planDowngradedAt) {
    return false;
  }

  const now = Date.now();
  const timeSinceDowngrade = now - user.planDowngradedAt;
  return timeSinceDowngrade < GRACE_PERIOD_MS;
}

// NOTE: get days remaining in grace period
export function getGracePeriodDaysRemaining(user: Doc<"user">): number {
  if (!user.planDowngradedAt) {
    return 0;
  }

  const now = Date.now();
  const timeSinceDowngrade = now - user.planDowngradedAt;
  const timeRemaining = GRACE_PERIOD_MS - timeSinceDowngrade;

  if (timeRemaining <= 0) {
    return 0;
  }

  return Math.ceil(timeRemaining / (24 * 60 * 60 * 1000));
}

// NOTE: detect and sync user plan changes (both upgrades and downgrades)
// NOTE: call this in any project-related query/mutation

// NOTE: overload for mutation context (can sync instantly)
export async function syncUserPlanStatus(ctx: ProtectedMutationCtx): Promise<void>;

// NOTE: overload for query context (read-only check)
export async function syncUserPlanStatus(ctx: ProtectedQueryCtx): Promise<void>;

// NOTE: implementation
export async function syncUserPlanStatus(
  ctx: ProtectedQueryCtx | ProtectedMutationCtx,
): Promise<void> {
  const user = await ctx.db.get(ctx.userId);

  if (!user) {
    return;
  }

  // NOTE: check current plan limit
  const { data } = await autumn.check(ctx, {
    featureId: "personal_projects",
  });

  const currentLimit = data?.included_usage || 2;

  // NOTE: get project count
  const projects = await ctx.db
    .query("project")
    .withIndex("by_owner", (q) => q.eq("ownerType", "user").eq("ownerId", ctx.userId))
    .filter((q) => q.eq(q.field("isArchived"), false))
    .collect();

  const projectCount = projects.length;

  const now = Date.now();

  // NOTE: upgrade detection - user upgraded (limit increased), clear downgrade flag
  if (user.planDowngradedAt && projectCount <= currentLimit) {
    // NOTE: sync instantly if in mutation context, otherwise cron job will handle it
    if ("patch" in ctx.db) {
      // NOTE: runtime check confirms this is mutation context, safe to cast
      const mutationDb = ctx.db as ProtectedMutationCtx["db"];
      await mutationDb.patch(ctx.userId, {
        planDowngradedAt: undefined,
        updatedAt: now,
      });
      // NOTE: clear cache on plan change to prevent inconsistency
      clearAccessCache(ctx as CtxWithCache);
    }
    return;
  }

  // NOTE: downgrade detection - user downgraded (over limit), set downgrade flag
  if (!user.planDowngradedAt && projectCount > currentLimit) {
    // NOTE: sync instantly if in mutation context, otherwise cron job will handle it
    if ("patch" in ctx.db) {
      // NOTE: runtime check confirms this is mutation context, safe to cast
      const mutationDb = ctx.db as ProtectedMutationCtx["db"];
      await mutationDb.patch(ctx.userId, {
        planDowngradedAt: now,
        updatedAt: now,
      });
      // NOTE: clear cache on plan change to prevent inconsistency
      clearAccessCache(ctx as CtxWithCache);
    }
  }
}

// NOTE: get user's accessible and restricted projects based on their plan
export async function getUserProjectsWithRestrictions(ctx: ProtectedQueryCtx): Promise<{
  accessibleProjects: Doc<"project">[];
  restrictedProjects: Doc<"project">[];
  isInGracePeriod: boolean;
  gracePeriodDaysRemaining: number;
}> {
  const ctxWithCache = ctx as CtxWithCache;

  // NOTE: return cached result if available (same request)
  if (ctxWithCache._userProjectsCache) {
    return ctxWithCache._userProjectsCache;
  }

  // NOTE: sync plan status first
  await syncUserPlanStatus(ctx);

  const user = await ctx.db.get(ctx.userId);

  if (!user) {
    throw new Error("User not found");
  }

  // NOTE: check if user is in grace period
  const inGracePeriod = isInGracePeriod(user);
  const gracePeriodDaysRemaining = getGracePeriodDaysRemaining(user);

  // NOTE: get all user projects (non-archived)
  const allProjects = await ctx.db
    .query("project")
    .withIndex("by_owner", (q) => q.eq("ownerType", "user").eq("ownerId", ctx.userId))
    .filter((q) => q.eq(q.field("isArchived"), false))
    .collect();

  // NOTE: if in grace period, all projects are accessible
  if (inGracePeriod) {
    const result = {
      accessibleProjects: allProjects,
      restrictedProjects: [],
      isInGracePeriod: true,
      gracePeriodDaysRemaining,
    };
    // NOTE: cache result for this request
    ctxWithCache._userProjectsCache = result;
    return result;
  }

  // NOTE: check user's current plan limit
  const { data } = await autumn.check(ctx, {
    featureId: "personal_projects",
  });

  const limit = data?.included_usage || 2;
  const currentProjectCount = allProjects.length;

  // NOTE: if within limit, all projects are accessible
  if (currentProjectCount <= limit) {
    const result = {
      accessibleProjects: allProjects,
      restrictedProjects: [],
      isInGracePeriod: false,
      gracePeriodDaysRemaining: 0,
    };
    // NOTE: cache result for this request
    ctxWithCache._userProjectsCache = result;
    return result;
  }

  // NOTE: over limit - sort by newest first and apply restriction
  const sortedProjects = [...allProjects].sort((a, b) => b.createdAt - a.createdAt);
  const accessibleProjects = sortedProjects.slice(0, limit);
  const restrictedProjects = sortedProjects.slice(limit);

  const result = {
    accessibleProjects,
    restrictedProjects,
    isInGracePeriod: false,
    gracePeriodDaysRemaining: 0,
  };

  // NOTE: cache result for this request
  ctxWithCache._userProjectsCache = result;

  return result;
}

// NOTE: check if a specific project is accessible to the user
export async function isProjectAccessible(
  ctx: ProtectedQueryCtx,
  projectId: Id<"project">,
): Promise<{
  accessible: boolean;
  reason?: "grace_period" | "within_limit" | "restricted";
  gracePeriodDaysRemaining?: number;
}> {
  const ctxWithCache = ctx as CtxWithCache;
  const cache = getAccessCache(ctxWithCache);

  // NOTE: return cached result if available (same request)
  const cacheKey = projectId;
  if (cache.has(cacheKey)) {
    const accessible = cache.get(cacheKey)!;
    return {
      accessible,
      reason: accessible ? "within_limit" : "restricted",
    };
  }

  const project = await ctx.db.get(projectId);

  if (!project) {
    cache.set(cacheKey, false);
    return { accessible: false, reason: "restricted" };
  }

  // NOTE: only check restrictions for user-owned projects
  if (project.ownerType !== "user" || project.ownerId !== ctx.userId) {
    // NOTE: for organization projects, use existing access checks
    cache.set(cacheKey, true);
    return { accessible: true };
  }

  // NOTE: sync plan status
  await syncUserPlanStatus(ctx);

  const user = await ctx.db.get(ctx.userId);

  if (!user) {
    cache.set(cacheKey, false);
    return { accessible: false, reason: "restricted" };
  }

  // NOTE: check if in grace period
  const inGracePeriod = isInGracePeriod(user);
  const gracePeriodDaysRemaining = getGracePeriodDaysRemaining(user);

  if (inGracePeriod) {
    cache.set(cacheKey, true);
    return {
      accessible: true,
      reason: "grace_period",
      gracePeriodDaysRemaining,
    };
  }

  // NOTE: get all projects with restrictions (uses _userProjectsCache internally)
  const { accessibleProjects } = await getUserProjectsWithRestrictions(ctx);

  const isAccessible = accessibleProjects.some((p) => p._id === projectId);

  // NOTE: cache result for this request
  cache.set(cacheKey, isAccessible);

  return {
    accessible: isAccessible,
    reason: isAccessible ? "within_limit" : "restricted",
  };
}
