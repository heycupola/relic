// Single source of truth for plan entitlements. The Autumn dashboard must mirror these
// numbers (plan `pro_plan`, features `projects` and `additional_shares`), since Autumn
// only bills for the usage we report; it never decides access.

export const PRO_PLAN_ID = "pro_plan";

export const BillingFeature = {
  Projects: "projects",
  AdditionalShares: "additional_shares",
} as const;

export type BillingFeatureId = (typeof BillingFeature)[keyof typeof BillingFeature];

export type PlanId = "free" | "pro";

export type PlanLimits = {
  includedProjects: number;
  includedSharesPerProject: number;
  canShare: boolean;
  canPurchaseAddOns: boolean;
  serviceAccounts: boolean;
  apiKeys: boolean;
};

export const PLANS: Record<PlanId, PlanLimits> = {
  free: {
    includedProjects: 1,
    includedSharesPerProject: 0,
    canShare: false,
    canPurchaseAddOns: false,
    serviceAccounts: false,
    apiKeys: false,
  },
  pro: {
    includedProjects: 5,
    includedSharesPerProject: 5,
    canShare: true,
    canPurchaseAddOns: true,
    serviceAccounts: true,
    apiKeys: true,
  },
};

export const ADD_ON_PRICES_USD = {
  project: 2,
  share: 1,
} as const;

export const MAX_SERVICE_ACCOUNTS_PER_PROJECT = 5;
export const MAX_API_KEYS_PER_USER = 5;

const DAY_MS = 24 * 60 * 60 * 1000;
export const GRACE_PERIOD_DAYS = 7;
export const GRACE_PERIOD_MS = GRACE_PERIOD_DAYS * DAY_MS;

type PlanFields = {
  hasPro: boolean;
  planDowngradedAt?: number | null;
};

export type PlanState = {
  plan: PlanId;
  limits: PlanLimits;
  isPro: boolean;
  inGracePeriod: boolean;
  gracePeriodDaysRemaining: number;
  /** Projects beyond the free allowance are locked once the grace period ends. */
  isRestricted: boolean;
};

export function getPlanState(user: PlanFields, now = Date.now()): PlanState {
  const plan: PlanId = user.hasPro ? "pro" : "free";
  const remainingMs =
    !user.hasPro && user.planDowngradedAt ? user.planDowngradedAt + GRACE_PERIOD_MS - now : 0;
  const inGracePeriod = remainingMs > 0;

  return {
    plan,
    limits: PLANS[plan],
    isPro: user.hasPro,
    inGracePeriod,
    gracePeriodDaysRemaining: inGracePeriod ? Math.ceil(remainingMs / DAY_MS) : 0,
    isRestricted: !user.hasPro && !inGracePeriod,
  };
}

type ProjectLike<Id extends string> = { _id: Id; createdAt: number };

/** When restricted, only the newest projects within the free allowance stay accessible. */
export function getAccessibleProjectIds<Id extends string>(
  activeProjects: ProjectLike<Id>[],
  state: PlanState,
): Set<Id> {
  if (!state.isRestricted) {
    return new Set(activeProjects.map((p) => p._id));
  }

  const newestFirst = [...activeProjects].sort(
    (a, b) => b.createdAt - a.createdAt || b._id.localeCompare(a._id),
  );

  return new Set(newestFirst.slice(0, PLANS.free.includedProjects).map((p) => p._id));
}

export function paidSharesFor(activeShareCount: number): number {
  return Math.max(0, activeShareCount - PLANS.pro.includedSharesPerProject);
}
