import { ConvexError } from "convex/values";
import { components, internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import type { Doc as BetterAuthDoc, Id as BetterAuthId } from "../betterAuth/_generated/dataModel";
import { OrgRole, OrgSubscriptionStatus } from "../betterAuth/lib/types";
import type { ProtectedActionCtx } from "./types";
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
    throw new ConvexError({
      code: "INSUFFICIENT_AUTHORIZATION",
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

async function isOrganizationAccessible(
  ctx: ProtectedActionCtx,
  organization: BetterAuthDoc<"organization">,
): Promise<{
  accessible: boolean;
  message: string | null;
}> {
  const hasActiveSubscription = async (): Promise<boolean> => {
    // NOTE: for paid orgs, check if subscription has been restored
    const orgCheck = await ctx.autumn.check(ctx, {
      entityId: organization._id,
      featureId: "organization_projects",
    });

    return orgCheck.data?.allowed || false;
  };

  const getLastPeriodEnd = async (): Promise<number | null> => {
    const entity = await ctx.autumn.entities.get(ctx, organization._id);

    if (!entity.data) {
      return null;
    }

    const product =
      entity.data.products.find((p) => p.status === "past_due") ??
      entity.data.products.find((p) => p.status === "active");

    if (!product || !product.current_period_end) {
      return null;
    }

    return product.current_period_end;
  };

  // NOTE: free orgs should never be suspended - they remain active indefinitely
  // NOTE: if we encounter this, it's likely a data inconsistency, but allow access
  if (organization.isFreeWithProPlan) {
    return {
      accessible: true,
      message: null,
    };
  }

  switch (organization.subscriptionStatus) {
    case OrgSubscriptionStatus.Suspended: {
      const isActive = await hasActiveSubscription();

      if (isActive) {
        // NOTE: subscription restored - instantly reactivate if in mutation context
        // NOTE: in query context, we can't patch, but the cron job will fix it soon
        await ctx.runMutation(components.betterAuth.organization.activateOrganization, {
          organizationId: organization._id,
        });

        return {
          accessible: true,
          message: null,
        };
      } else {
        return {
          accessible: false,
          message:
            "Organization is suspended. Please update your payment method to restore access.",
        };
      }
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
        await ctx.runMutation(components.betterAuth.organization.wipeOrganization, {
          organizationId: organization._id,
        });

        return {
          accessible: false,
          message: `Organization has been deleted and no longer exists.`,
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
        await ctx.runMutation(components.betterAuth.organization.suspendOrganization, {
          organizationId: organization._id,
        });

        return {
          accessible: false,
          message:
            "Organization has been suspended, you can no longer access it. Please pay the bill to reactivate it.",
        };
      }

      const daysRemaining = Math.ceil(timeRemaining / MILLISECONDS_PER_DAY);

      return {
        accessible: true,
        message: `Payment failed. You have ${daysRemaining} day${daysRemaining !== 1 ? "s" : ""} remaining before organization is suspended.`,
      };
    }
    case OrgSubscriptionStatus.Active: {
      const isActive = await hasActiveSubscription();

      if (isActive) {
        return {
          accessible: true,
          message: null,
        };
      } else {
        const lastPeriodEnd = await getLastPeriodEnd();

        if (!lastPeriodEnd) {
          console.error(`Unable to get period_end from Autumn for og ${organization._id}`);
          return {
            accessible: false,
            message: "Unable to verify payment status. Please contact support.",
          };
        }

        await ctx.runMutation(components.betterAuth.organization.markOrganizationPaymentLapsed, {
          organizationId: organization._id,
          paymentLapsedAt: lastPeriodEnd,
        });

        return {
          accessible: true,
          message:
            "The organization payment has lapsed. You have 7 days to complete the payment until the organization get suspended.",
        };
      }
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
  ctx: ProtectedActionCtx,
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

  return await isOrganizationAccessible(ctx, organization as BetterAuthDoc<"organization">);
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

type CtxWithCache = ProtectedActionCtx & {
  _projectAccessCache?: Map<string, ProjectAccessResult>;
  _userProjectsCache?: {
    accessibleProjects: Doc<"project">[];
    restrictedProjects: Doc<"project">[];
    isInGracePeriod: boolean;
    gracePeriodDaysRemaining: number;
  };
};

function getAccessCache(ctx: CtxWithCache): Map<string, ProjectAccessResult> {
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

export async function syncUserPlanStatus(ctx: ProtectedActionCtx): Promise<{
  user: BetterAuthDoc<"user">;
  projects: Doc<"project">[];
  currentLimit: number;
}> {
  const user = await ctx.runQuery(components.betterAuth.user.loadUserById, {
    userId: ctx.userId,
  });

  if (!user) {
    throw new ConvexError({
      code: "USER_NOT_FOUND",
      message: "User not found",
      severity: ErrorSeverity.High,
    });
  }

  const { data } = await ctx.autumn.check(ctx, {
    featureId: "personal_projects",
  });

  const currentLimit = Math.max(0, data?.included_usage ?? 2);

  const projects = await ctx.runQuery(internal.project._loadProjects, {
    userId: user._id as BetterAuthId<"user">,
  });

  const projectCount = projects.length;

  // NOTE: upgrade detection - user upgraded (limit increased), clear downgrade flag
  if (user.planDowngradedAt && projectCount <= currentLimit) {
    await ctx.runMutation(components.betterAuth.user.upgradeToPro, { userId: user._id });
    clearAccessCache(ctx as CtxWithCache);

    return {
      user: user as BetterAuthDoc<"user">,
      projects,
      currentLimit,
    };
  }

  // NOTE: downgrade detection - user downgraded (over limit), set downgrade flag
  if (!user.planDowngradedAt && projectCount > currentLimit) {
    await ctx.runMutation(components.betterAuth.user.downgradeToFree, { userId: user._id });
    clearAccessCache(ctx as CtxWithCache);

    return {
      user: user as BetterAuthDoc<"user">,
      projects,
      currentLimit,
    };
  }

  // NOTE: no status change needed - user is within their current plan limits
  return {
    user: user as BetterAuthDoc<"user">,
    projects,
    currentLimit,
  };
}

// NOTE: get user's accessible and restricted projects based on their plan
export async function getUserProjectsWithRestrictions(ctx: ProtectedActionCtx): Promise<{
  accessibleProjects: Doc<"project">[];
  restrictedProjects: Doc<"project">[];
  isInGracePeriod: boolean;
  gracePeriodDaysRemaining: number;
}> {
  const ctxWithCache = ctx as CtxWithCache;

  if (ctxWithCache._userProjectsCache) {
    return ctxWithCache._userProjectsCache;
  }

  const { user, projects, currentLimit } = await syncUserPlanStatus(ctx);

  const inGracePeriod = isInGracePeriod(user);
  const gracePeriodDaysRemaining = getGracePeriodDaysRemaining(user);

  if (inGracePeriod) {
    const result = {
      accessibleProjects: projects,
      restrictedProjects: [],
      isInGracePeriod: true,
      gracePeriodDaysRemaining,
    };
    ctxWithCache._userProjectsCache = result;
    return result;
  }

  const currentProjectCount = projects.length;

  if (currentProjectCount <= currentLimit) {
    const result = {
      accessibleProjects: projects,
      restrictedProjects: [],
      isInGracePeriod: false,
      gracePeriodDaysRemaining: 0,
    };
    ctxWithCache._userProjectsCache = result;
    return result;
  }

  const sortedProjects = [...projects].sort((a, b) => {
    if (b.createdAt !== a.createdAt) {
      return b.createdAt - a.createdAt;
    }
    return b._id.localeCompare(a._id);
  });
  const accessibleProjects = sortedProjects.slice(0, currentLimit);
  const restrictedProjects = sortedProjects.slice(currentLimit);

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
  ctx: ProtectedActionCtx,
  project: Doc<"project">,
): Promise<ProjectAccessResult> {
  if (project.isArchived) {
    return {
      accessible: false,
      reason: ProjectAccessReason.Archived,
    };
  }

  const ctxWithCache = ctx as CtxWithCache;
  const cache = getAccessCache(ctxWithCache);

  const cacheKey = project._id;
  const cachedResult = cache.get(cacheKey);

  if (cachedResult) {
    return cachedResult;
  }

  if (project.ownerType !== ProjectOwner.User || project.ownerId !== ctx.userId) {
    const result = { accessible: true };
    cache.set(cacheKey, result);
    return result;
  }

  const { user } = await syncUserPlanStatus(ctx);

  const inGracePeriod = isInGracePeriod(user as BetterAuthDoc<"user">);
  const gracePeriodDaysRemaining = getGracePeriodDaysRemaining(user as BetterAuthDoc<"user">);

  if (inGracePeriod) {
    const result = {
      accessible: true,
      reason: ProjectAccessReason.GracePeriod,
      gracePeriodDaysRemaining,
    };
    cache.set(cacheKey, result);
    return result;
  }

  const { accessibleProjects } = await getUserProjectsWithRestrictions(ctx);

  const isAccessible = accessibleProjects.some((p) => p._id === project._id);

  const result = {
    accessible: isAccessible,
    reason: isAccessible ? ProjectAccessReason.WithinLimit : ProjectAccessReason.Restricted,
  };
  cache.set(cacheKey, result);

  return result;
}

export const assertProjectAccess = async (
  ctx: ProtectedActionCtx,
  project: Doc<"project">,
  sector?: Sector,
  permissions?: AccessEntity[],
): Promise<void> => {
  switch (project.ownerType) {
    case ProjectOwner.User: {
      if (ctx.userId !== project.ownerId) {
        throw new ConvexError({
          code: "INSUFFICIENT_AUTHORIZATION",
          message: "You are not the owner of the project",
          severity: ErrorSeverity.High,
        });
      }

      const { accessible, reason } = await isProjectAccessible(ctx, project);

      if (!accessible) {
        throw new ConvexError({
          code: "ORGANIZATION_INACCESSIBLE",
          message: reason,
          severity: ErrorSeverity.High,
        });
      }

      break;
    }
    case ProjectOwner.Organization: {
      const { isOrganizationMember, role } = await ctx.runQuery(
        components.betterAuth.member.isOrganizationMember,
        {
          userId: ctx.userId,
          organizationId: project.ownerId,
        },
      );

      if (!isOrganizationMember) {
        throw new ConvexError({
          code: "INSUFFICIENT_AUTHORIZATION",
          message: "You are not the member of the organization of the project",
          severity: ErrorSeverity.High,
        });
      }

      if ((sector && !permissions) || (!sector && permissions)) {
        throw new ConvexError({
          code: "INVALID_ARGUMENTS",
          message: "sector and permissions must be provided together",
          severity: ErrorSeverity.High,
        });
      }

      if (sector && permissions) {
        if (role) {
          assertPermission(sector, role as OrgRole, permissions);
        } else {
          throw new ConvexError({
            code: "MEMBER_ROLE_MISSING",
            message: "The member's role is missing",
            severity: ErrorSeverity.High,
          });
        }
      }

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
