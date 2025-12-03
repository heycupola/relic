import { components, internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import type { Doc as BetterAuthDoc, Id as BetterAuthId } from "../betterAuth/_generated/dataModel";
import { createError, ErrorCode, notFoundError, permissionError } from "./errors";
import type { ProtectedActionCtx, ProtectedMutationCtx, ProtectedQueryCtx } from "./types";
import { ErrorSeverity } from "./types";

const GRACE_PERIOD_DAYS = 7;
const GRACE_PERIOD_MS = GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000;

// NOTE: context type with request-level cache
export enum ProjectAccessReason {
  GracePeriod = "grace_period",
  WithinLimit = "within_limit",
  Restricted = "restricted",
  Archived = "archived",
}

export type ProjectAccessResult = {
  accessible: boolean;
  reason?: ProjectAccessReason;
  gracePeriodDaysRemaining?: number;
};

export function isInGracePeriod(user: BetterAuthDoc<"user">): boolean {
  if (!user.planDowngradedAt) {
    return false;
  }

  const now = Date.now();
  const timeSinceDowngrade = now - user.planDowngradedAt;
  return timeSinceDowngrade < GRACE_PERIOD_MS;
}

export function getGracePeriodDaysRemaining(user: BetterAuthDoc<"user">): number {
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

export async function syncUserPlanStatus(
  ctx: ProtectedQueryCtx | ProtectedMutationCtx | ProtectedActionCtx,
): Promise<{
  user: BetterAuthDoc<"user">;
  projects: Doc<"project">[];
}> {
  const user = await ctx.runQuery(components.betterAuth.user.loadUserById, {
    userId: ctx.userId,
  });

  if (!user) {
    throw notFoundError("user");
  }

  const projects = await ctx.runQuery(internal.project._loadProjects, {
    ownerId: user._id as BetterAuthId<"user">,
  });

  return {
    user: user as unknown as BetterAuthDoc<"user">,
    projects,
  };
}

// NOTE: get user's accessible and restricted projects based on their plan
export async function getUserProjectsWithRestrictions(
  ctx: ProtectedQueryCtx | ProtectedMutationCtx | ProtectedActionCtx,
): Promise<{
  accessibleProjects: Doc<"project">[];
  restrictedProjects: Doc<"project">[];
  isInGracePeriod: boolean;
  gracePeriodDaysRemaining: number;
}> {
  const { user, projects } = await syncUserPlanStatus(ctx);

  const inGracePeriod = isInGracePeriod(user);
  const gracePeriodDaysRemaining = getGracePeriodDaysRemaining(user);

  return {
    accessibleProjects: projects,
    restrictedProjects: [],
    isInGracePeriod: inGracePeriod,
    gracePeriodDaysRemaining,
  };
}

// NOTE: check if a specific project is accessible to the user
export async function isProjectAccessible(
  ctx: ProtectedQueryCtx | ProtectedMutationCtx | ProtectedActionCtx,
  project: Doc<"project">,
): Promise<ProjectAccessResult> {
  if (project.isArchived) {
    return {
      accessible: false,
      reason: ProjectAccessReason.Archived,
    };
  }

  const { user } = await syncUserPlanStatus(ctx);

  const inGracePeriod = isInGracePeriod(user as BetterAuthDoc<"user">);
  const gracePeriodDaysRemaining = getGracePeriodDaysRemaining(user as BetterAuthDoc<"user">);

  if (inGracePeriod) {
    return {
      accessible: true,
      reason: ProjectAccessReason.GracePeriod,
      gracePeriodDaysRemaining,
    };
  }

  return {
    accessible: true,
    reason: ProjectAccessReason.WithinLimit,
  };
}

export const assertProjectAccess = async (
  ctx: ProtectedQueryCtx | ProtectedMutationCtx | ProtectedActionCtx,
  project: Doc<"project">,
): Promise<void> => {
  if (ctx.userId !== project.ownerId) {
    throw permissionError("access this project", ErrorSeverity.High);
  }

  const { accessible, reason } = await isProjectAccessible(ctx, project);

  if (!accessible) {
    throw createError({
      code: ErrorCode.PROJECT_INACCESSIBLE,
      message: reason || "This project is not accessible",
      severity: ErrorSeverity.High,
    });
  }
};
