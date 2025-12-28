import { components, internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
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

function getAccessibleProjectIds(projects: Doc<"project">[]): Id<"project">[] {
  const FREE_PLAN_PROJECT_LIMIT = 1;

  const sortedProjects = [...projects].sort((a, b) => {
    const timeDiff = b.createdAt - a.createdAt;
    if (timeDiff !== 0) return timeDiff;
    return b._id.localeCompare(a._id);
  });

  return sortedProjects.slice(0, FREE_PLAN_PROJECT_LIMIT).map((p) => p._id);
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

  const projects = await ctx.runQuery(internal.project._loadActiveProjectsByOwner, {
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

  // If user has Pro plan or in grace period, all projects accessible
  if (user.hasPro || inGracePeriod) {
    return {
      accessibleProjects: projects,
      restrictedProjects: [],
      isInGracePeriod: inGracePeriod,
      gracePeriodDaysRemaining,
    };
  }

  // Free plan + grace period ended: only 2 newest projects accessible
  const accessibleProjectIds = getAccessibleProjectIds(projects);
  const accessibleProjects = projects.filter((p) => accessibleProjectIds.includes(p._id));
  const restrictedProjects = projects.filter((p) => !accessibleProjectIds.includes(p._id));

  return {
    accessibleProjects,
    restrictedProjects,
    isInGracePeriod: false,
    gracePeriodDaysRemaining: 0,
  };
}

// NOTE: check if a specific project is accessible to the user
export async function isProjectAccessible(
  ctx: ProtectedQueryCtx | ProtectedMutationCtx | ProtectedActionCtx,
  project: Doc<"project">,
): Promise<ProjectAccessResult> {
  const isOwner = ctx.userId === project.ownerId;
  const { user } = await syncUserPlanStatus(ctx);
  const inGracePeriod = isInGracePeriod(user as BetterAuthDoc<"user">);
  const gracePeriodDaysRemaining = getGracePeriodDaysRemaining(user as BetterAuthDoc<"user">);

  if (project.isArchived) {
    return {
      accessible: false,
      reason: ProjectAccessReason.Archived,
    };
  }

  // Check if user is not owner - must have projectShare
  if (!isOwner) {
    const projectShare = await ctx.runQuery(
      internal.projectShare._loadActiveShareByProjectAndUser,
      {
        projectId: project._id,
        userId: ctx.userId,
      },
    );

    if (!projectShare) {
      return {
        accessible: false,
        reason: ProjectAccessReason.Restricted,
      };
    }

    // Check if owner is restricted and this project is in their restricted list
    const owner = await ctx.runQuery(components.betterAuth.user.loadUserById, {
      userId: project.ownerId,
    });

    if (!owner) {
      return {
        accessible: false,
        reason: ProjectAccessReason.Restricted,
      };
    }

    const ownerInGracePeriod = isInGracePeriod(owner as BetterAuthDoc<"user">);

    // Only check restriction if owner has been downgraded (planDowngradedAt exists)
    if (owner.planDowngradedAt && !owner.hasPro && !ownerInGracePeriod) {
      const ownerProjects = await ctx.runQuery(internal.project._loadActiveProjectsByOwner, {
        ownerId: owner._id as BetterAuthId<"user">,
      });

      const accessibleProjectIds = getAccessibleProjectIds(ownerProjects);

      if (!accessibleProjectIds.includes(project._id)) {
        return {
          accessible: false,
          reason: ProjectAccessReason.Restricted,
        };
      }
    }
  }

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
  options?: { skipArchivedCheck?: boolean },
): Promise<void> => {
  const { accessible, reason } = await isProjectAccessible(ctx, project);

  if (!accessible) {
    // Non-owner without valid share
    if (reason === ProjectAccessReason.Restricted) {
      throw permissionError("access this project", ErrorSeverity.High);
    }

    // Skip archived check if requested (e.g., for archive/unarchive operations)
    if (options?.skipArchivedCheck && reason === ProjectAccessReason.Archived) {
      return;
    }

    throw createError({
      code: ErrorCode.PROJECT_INACCESSIBLE,
      message: reason || "This project is not accessible",
      severity: ErrorSeverity.High,
    });
  }
};
