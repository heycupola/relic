import { ConvexError } from "convex/values";
import { components, internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import type { Doc as BetterAuthDoc, Id as BetterAuthId } from "../betterAuth/_generated/dataModel";
import { OrgRole, OrgSubscriptionStatus } from "../betterAuth/lib/types";
import { createError, ErrorCode, notFoundError, permissionError } from "./errors";
import type { ProtectedActionCtx, ProtectedMutationCtx, ProtectedQueryCtx } from "./types";
import { ErrorSeverity, ProjectOwner } from "./types";

export enum Sector {
  Project = "project",
  Environment = "environment",
  Folder = "folder",
  Secret = "secret",
}

type AccessEntity = "create" | "read" | "update" | "delete";

type AccessControl = {
  [S in Sector]: {
    [O in OrgRole]: AccessEntity[];
  };
};

const accessControl: AccessControl = {
  [Sector.Project]: {
    [OrgRole.Owner]: ["create", "read", "update", "delete"],
    [OrgRole.Admin]: ["create", "read", "update", "delete"],
    [OrgRole.Member]: ["read"],
    [OrgRole.Viewer]: ["read"],
  },
  [Sector.Environment]: {
    [OrgRole.Owner]: ["create", "read", "update", "delete"],
    [OrgRole.Admin]: ["create", "read", "update", "delete"],
    [OrgRole.Member]: ["read"],
    [OrgRole.Viewer]: ["read"],
  },
  [Sector.Folder]: {
    [OrgRole.Owner]: ["create", "read", "update", "delete"],
    [OrgRole.Admin]: ["create", "read", "update", "delete"],
    [OrgRole.Member]: ["create", "read", "update", "delete"],
    [OrgRole.Viewer]: ["read"],
  },
  [Sector.Secret]: {
    [OrgRole.Owner]: ["create", "read", "update", "delete"],
    [OrgRole.Admin]: ["create", "read", "update", "delete"],
    [OrgRole.Member]: ["create", "read", "update", "delete"],
    [OrgRole.Viewer]: ["read"],
  },
};

// NOTE: this is for checking permissions of organization members
export function assertPermission(sector: Sector, role: OrgRole, permissions: AccessEntity[]) {
  const rolePermissions = accessControl[sector][role];

  const missingPermissions = permissions.filter((p) => !rolePermissions.includes(p));

  if (missingPermissions.length > 0) {
    throw createError({
      code: ErrorCode.INSUFFICIENT_PERMISSION,
      message: `Role ${role} does not have permissions: ${missingPermissions.join(
        ", ",
      )} in sector ${sector}`,
      severity: ErrorSeverity.High,
    });
  }
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1_000;
const MILLISECONDS_PER_MINUTE = 1_000 * 60;
const MILLISECONDS_PER_DAY = 1_000 * 60 * 60 * 24;

export async function isOrganizationAccessible(
  organization: BetterAuthDoc<"organization">,
): Promise<{
  accessible: boolean;
  message: string | null;
}> {
  if (organization.isFreeWithProPlan) {
    return {
      accessible: true,
      message: null,
    };
  }

  switch (organization.subscriptionStatus) {
    case OrgSubscriptionStatus.Active: {
      return {
        accessible: true,
        message: null,
      };
    }
    case OrgSubscriptionStatus.Suspended: {
      return {
        accessible: false,
        message: "Organization is suspended. Please update your payment method to restore access.",
      };
    }
    case OrgSubscriptionStatus.Pending: {
      const now = Date.now();

      if (!organization.paymentExpiresAt) {
        console.error(`Organization ${organization._id} is Pending but missing paymentExpiresAt`);
        return {
          accessible: false,
          message: "Organization payment data is incomplete. Please contact support.",
        };
      }

      const expiresAt = organization.paymentExpiresAt;
      const timeRemaining = Math.max(0, expiresAt - now);
      const minutesRemaining = Math.floor(timeRemaining / MILLISECONDS_PER_MINUTE);

      if (minutesRemaining <= 0) {
        return {
          accessible: false,
          message: "Organization payment period has expired.",
        };
      }

      return {
        accessible: false,
        message: `Organization payment is pending. Complete payment within ${minutesRemaining} minutes or the organization will be deleted.`,
      };
    }
    case OrgSubscriptionStatus.PaymentLapsed: {
      const now = Date.now();

      if (!organization.paymentLapsedAt) {
        console.error(
          `Organization ${organization._id} is PaymentLapsed but missing paymentLapsedAt`,
        );
        return {
          accessible: false,
          message: "Organization payment data is incomplete. Please contact support.",
        };
      }

      const lapsedAt = organization.paymentLapsedAt;
      const suspendAt = lapsedAt + SEVEN_DAYS_MS;
      const timeRemaining = Math.max(0, suspendAt - now);

      if (timeRemaining <= 0) {
        return {
          accessible: false,
          message:
            "Organization grace period has ended. Please update your payment method to restore access.",
        };
      }

      const daysRemaining = Math.ceil(timeRemaining / MILLISECONDS_PER_DAY);

      return {
        accessible: true,
        message: `Payment failed. You have ${daysRemaining} day${daysRemaining !== 1 ? "s" : ""} remaining before organization is suspended.`,
      };
    }
    default: {
      console.error(
        `Unknown organization subscription status: ${organization.subscriptionStatus} for org ${organization._id}`,
      );
      return {
        accessible: false,
        message: `Unknown organization subscription status: ${organization.subscriptionStatus}. Please contact support.`,
      };
    }
  }
}

export async function isProjectOrganizationAccessible(
  ctx: ProtectedQueryCtx | ProtectedMutationCtx | ProtectedActionCtx,
  project: Doc<"project">,
): Promise<{
  accessible: boolean;
  message: string | null;
}> {
  if (project.ownerType !== "organization") {
    return {
      accessible: true,
      message: null,
    };
  }

  const organization = await ctx.runQuery(components.betterAuth.organization.loadOrganizationById, {
    organizationId: project.ownerId as BetterAuthId<"organization">,
  });

  if (!organization) {
    console.error(`Organization ${project.ownerId} not found for project ${project._id}`);
    return {
      accessible: false,
      message: "Organization not found",
    };
  }

  return await isOrganizationAccessible(organization as BetterAuthDoc<"organization">);
}

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
    userId: user._id as BetterAuthId<"user">,
  });

  return {
    user: user as BetterAuthDoc<"user">,
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

  if (project.ownerType !== ProjectOwner.User || project.ownerId !== ctx.userId) {
    return { accessible: true };
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
  sector?: Sector,
  permissions?: AccessEntity[],
): Promise<void> => {
  switch (project.ownerType) {
    case ProjectOwner.User: {
      if (ctx.userId !== project.ownerId) {
        throw permissionError("access this project", ErrorSeverity.High);
      }

      const { accessible, reason } = await isProjectAccessible(ctx, project);

      if (!accessible) {
        throw createError({
          code: ErrorCode.ORGANIZATION_INACCESSIBLE,
          message: reason || "This organization is not accessible",
          severity: ErrorSeverity.High,
        });
      }

      break;
    }
    case ProjectOwner.Organization: {
      await assertOrganizationPermissions(
        ctx,
        project.ownerId as BetterAuthId<"organization">,
        sector,
        permissions,
      );

      const { message, accessible } = await isProjectOrganizationAccessible(ctx, project);

      if (!accessible) {
        throw new ConvexError({
          code: "ORGANIZATION_INACCESSIBLE",
          message,
          severity: ErrorSeverity.High,
        });
      }

      break;
    }
  }
};

export const assertOrganizationPermissions = async (
  ctx: ProtectedQueryCtx | ProtectedMutationCtx | ProtectedActionCtx,
  organizationId: BetterAuthId<"organization">,
  sector?: Sector,
  permissions?: AccessEntity[],
) => {
  const { isOrganizationMember, role } = await ctx.runQuery(
    components.betterAuth.member.isOrganizationMember,
    {
      userId: ctx.userId,
      organizationId,
    },
  );

  if (!isOrganizationMember) {
    throw permissionError("access this organization", ErrorSeverity.High);
  }

  if ((sector && !permissions) || (!sector && permissions)) {
    throw createError({
      code: ErrorCode.INVALID_ARGUMENTS,
      message: "sector and permissions must be provided together",
      severity: ErrorSeverity.High,
    });
  }

  if (sector && permissions) {
    if (role) {
      assertPermission(sector, role as OrgRole, permissions);
    } else {
      throw createError({
        code: ErrorCode.INVALID_RESOURCE_STATE,
        message: "The member's role is missing",
        severity: ErrorSeverity.High,
      });
    }
  }
};
