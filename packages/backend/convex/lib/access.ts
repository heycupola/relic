import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { findActiveShare, findUser, listActiveOwnedProjects } from "./data";
import { createError, ErrorCode, permissionError } from "./errors";
import { getAccessibleProjectIds, getPlanState } from "./plans";
import { ErrorSeverity } from "./types";

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

type AccessCtx = Pick<QueryCtx, "db" | "runQuery"> & { userId: string };

/** False when the owner was downgraded, the grace period ended and this project is over the free allowance. */
export async function isUnlockedByOwnerPlan(
  ctx: Pick<QueryCtx, "db" | "runQuery">,
  project: Doc<"project">,
): Promise<boolean> {
  const owner = await findUser(ctx, project.ownerId);
  if (!owner) return false;

  const state = getPlanState(owner);
  if (!state.isRestricted || !owner.planDowngradedAt) return true;

  const projects = await listActiveOwnedProjects(ctx, project.ownerId);
  return getAccessibleProjectIds(projects, state).has(project._id);
}

export async function isProjectAccessible(
  ctx: AccessCtx,
  project: Doc<"project">,
): Promise<ProjectAccessResult> {
  if (project.isArchived) {
    return { accessible: false, reason: ProjectAccessReason.Archived };
  }

  if (project.ownerId === ctx.userId) {
    return { accessible: true, reason: ProjectAccessReason.WithinLimit };
  }

  const share = await findActiveShare(ctx, project._id, ctx.userId);
  if (!share || !(await isUnlockedByOwnerPlan(ctx, project))) {
    return { accessible: false, reason: ProjectAccessReason.Restricted };
  }

  return { accessible: true, reason: ProjectAccessReason.WithinLimit };
}

export async function assertProjectAccess(
  ctx: AccessCtx,
  project: Doc<"project">,
  options?: { skipArchivedCheck?: boolean },
): Promise<void> {
  const { accessible, reason } = await isProjectAccessible(ctx, project);
  if (accessible) return;

  if (reason === ProjectAccessReason.Archived && options?.skipArchivedCheck) {
    if (project.ownerId === ctx.userId) return;
    if (await findActiveShare(ctx, project._id, ctx.userId)) return;
    permissionError("access this project", ErrorSeverity.High);
  }

  if (reason === ProjectAccessReason.Restricted) {
    permissionError("access this project", ErrorSeverity.High);
  }

  createError({
    code: ErrorCode.PROJECT_INACCESSIBLE,
    message:
      reason === ProjectAccessReason.Archived
        ? "This project is archived"
        : "This project is not accessible",
    severity: ErrorSeverity.High,
  });
}

export function assertProjectOwner(
  ctx: { userId: string },
  project: Doc<"project">,
  action: string,
): void {
  if (project.ownerId !== ctx.userId) {
    createError({
      code: ErrorCode.INSUFFICIENT_PERMISSION,
      message: `Only the project owner can ${action}`,
      severity: ErrorSeverity.High,
    });
  }
}
