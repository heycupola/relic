import {
  ADD_ON_PRICES_USD,
  GRACE_PERIOD_DAYS,
  MAX_API_KEYS_PER_USER,
  MAX_SERVICE_ACCOUNTS_PER_PROJECT,
  PLANS,
} from "@repo/backend/convex/lib/plans";

// Limits come from the backend entitlements; the price must match the Autumn `pro_plan`.
export const FREE_PRICE_USD = 0;
export const PRO_PRICE_USD = 9;

export const FREE_PROJECTS = PLANS.free.includedProjects;
export const PRO_PROJECTS = PLANS.pro.includedProjects;
export const PRO_COLLABORATORS_PER_PROJECT = PLANS.pro.includedSharesPerProject;
export const EXTRA_PROJECT_PRICE_USD = ADD_ON_PRICES_USD.project;
export const EXTRA_COLLABORATOR_PRICE_USD = ADD_ON_PRICES_USD.share;
export const MAX_API_KEYS = MAX_API_KEYS_PER_USER;
export { GRACE_PERIOD_DAYS, MAX_SERVICE_ACCOUNTS_PER_PROJECT };

export const PRO_PRICE_LABEL = `$${PRO_PRICE_USD}/month`;

export const ADD_ONS = [
  `$${EXTRA_PROJECT_PRICE_USD}/month per extra project`,
  `$${EXTRA_COLLABORATOR_PRICE_USD}/month per extra collaborator`,
] as const;

export interface PlanFeature {
  id: string;
  /** Emphasized lead-in; `rest` continues the sentence. */
  highlight: string;
  rest: string;
}

export const PRO_FEATURES: readonly PlanFeature[] = [
  {
    id: "sharing",
    highlight: "Collaborate on projects",
    rest: `, ${PRO_COLLABORATORS_PER_PROJECT} collaborators per project included`,
  },
  { id: "projects", highlight: `${PRO_PROJECTS} projects`, rest: " included" },
  { id: "service-accounts", highlight: "Service accounts & OIDC", rest: " for CI/CD" },
  { id: "api-keys", highlight: "API keys", rest: " for programmatic access" },
  { id: "early-access", highlight: "Early access", rest: " to new features" },
];

export const FREE_FEATURES = [
  `${FREE_PROJECTS} project`,
  "Activity logs & analytics",
  "Fully encrypted",
  "CLI & TUI access",
] as const;

export const FREE_EXCLUSIONS = ["No project sharing", "No CI/CD integration"] as const;

export function planFeatureText(feature: PlanFeature): string {
  return `${feature.highlight}${feature.rest}`;
}
