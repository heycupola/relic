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

function getAccessCache(ctx: CtxWithCache): Map<string, boolean> {
  if (!ctx._projectAccessCache) {
    ctx._projectAccessCache = new Map();
  }
  return ctx._projectAccessCache;
}

function clearAccessCache(ctx: CtxWithCache): void {
  if (ctx._projectAccessCache) {
    ctx._projectAccessCache.clear();
  }
  ctx._userProjectsCache = undefined;
}

export function isInGracePeriod(user: Doc<"user">): boolean {
  if (!user.planDowngradedAt) {
    return false;
  }

  const now = Date.now();
  const timeSinceDowngrade = now - user.planDowngradedAt;
  return timeSinceDowngrade < GRACE_PERIOD_MS;
}

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

export async function syncUserPlanStatus(ctx: ProtectedMutationCtx): Promise<void>;

export async function syncUserPlanStatus(ctx: ProtectedQueryCtx): Promise<void>;

export async function syncUserPlanStatus(
  ctx: ProtectedQueryCtx | ProtectedMutationCtx,
): Promise<void> {
  const user = await ctx.db.get(ctx.userId);

  if (!user) {
    return;
  }

  const { data } = await autumn.check(ctx, {
    featureId: "personal_projects",
  });

  const currentLimit = data?.included_usage || 2;

  const projects = await ctx.db
    .query("project")
    .withIndex("by_owner", (q) => q.eq("ownerType", "user").eq("ownerId", ctx.userId))
    .filter((q) => q.eq(q.field("isArchived"), false))
    .collect();

  const projectCount = projects.length;

  const now = Date.now();

  // NOTE: upgrade detection - user upgraded (limit increased), clear downgrade flag
  if (user.planDowngradedAt && projectCount <= currentLimit) {
    if ("patch" in ctx.db) {
      const mutationDb = ctx.db as ProtectedMutationCtx["db"];
      await mutationDb.patch(ctx.userId, {
        planDowngradedAt: undefined,
        updatedAt: now,
      });
      clearAccessCache(ctx as CtxWithCache);
    }
    return;
  }

  // NOTE: downgrade detection - user downgraded (over limit), set downgrade flag
  if (!user.planDowngradedAt && projectCount > currentLimit) {
    if ("patch" in ctx.db) {
      const mutationDb = ctx.db as ProtectedMutationCtx["db"];
      await mutationDb.patch(ctx.userId, {
        planDowngradedAt: now,
        updatedAt: now,
      });
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

  if (ctxWithCache._userProjectsCache) {
    return ctxWithCache._userProjectsCache;
  }

  await syncUserPlanStatus(ctx);

  const user = await ctx.db.get(ctx.userId);

  if (!user) {
    throw new Error("User not found");
  }

  const inGracePeriod = isInGracePeriod(user);
  const gracePeriodDaysRemaining = getGracePeriodDaysRemaining(user);

  const allProjects = await ctx.db
    .query("project")
    .withIndex("by_owner", (q) => q.eq("ownerType", "user").eq("ownerId", ctx.userId))
    .filter((q) => q.eq(q.field("isArchived"), false))
    .collect();

  if (inGracePeriod) {
    const result = {
      accessibleProjects: allProjects,
      restrictedProjects: [],
      isInGracePeriod: true,
      gracePeriodDaysRemaining,
    };
    ctxWithCache._userProjectsCache = result;
    return result;
  }

  const { data } = await autumn.check(ctx, {
    featureId: "personal_projects",
  });

  const limit = data?.included_usage || 2;
  const currentProjectCount = allProjects.length;

  if (currentProjectCount <= limit) {
    const result = {
      accessibleProjects: allProjects,
      restrictedProjects: [],
      isInGracePeriod: false,
      gracePeriodDaysRemaining: 0,
    };
    ctxWithCache._userProjectsCache = result;
    return result;
  }

  const sortedProjects = [...allProjects].sort((a, b) => b.createdAt - a.createdAt);
  const accessibleProjects = sortedProjects.slice(0, limit);
  const restrictedProjects = sortedProjects.slice(limit);

  const result = {
    accessibleProjects,
    restrictedProjects,
    isInGracePeriod: false,
    gracePeriodDaysRemaining: 0,
  };

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

  const cacheKey = projectId;
  if (cache.has(cacheKey)) {
    const accessible = cache.get(cacheKey);

    if (!accessible) {
      throw new Error("The project is not cached");
    }

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

  if (project.ownerType !== "user" || project.ownerId !== ctx.userId) {
    cache.set(cacheKey, true);
    return { accessible: true };
  }

  await syncUserPlanStatus(ctx);

  const user = await ctx.db.get(ctx.userId);

  if (!user) {
    cache.set(cacheKey, false);
    return { accessible: false, reason: "restricted" };
  }

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

  const { accessibleProjects } = await getUserProjectsWithRestrictions(ctx);

  const isAccessible = accessibleProjects.some((p) => p._id === projectId);

  cache.set(cacheKey, isAccessible);

  return {
    accessible: isAccessible,
    reason: isAccessible ? "within_limit" : "restricted",
  };
}
