/** Must match the backend limit in `convex/apiKey.ts`. */
export const MAX_API_KEYS = 5;

export const PRO_PRICE_LABEL = "$9/month";

export const ADD_ONS = ["$2 per extra project", "$1 per extra share"] as const;

export const PRO_FEATURES = [
  { id: "sharing", highlight: "Collaborate on projects", rest: ", 5 free shares per project" },
  { id: "projects", highlight: "5 projects", rest: " included" },
  { id: "service-accounts", highlight: "Service accounts & OIDC", rest: " for CI/CD" },
  { id: "api-keys", highlight: "API keys", rest: " for programmatic access" },
  { id: "early-access", highlight: "Early access", rest: " to new features" },
] as const;
