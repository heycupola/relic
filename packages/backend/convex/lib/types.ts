import type { Autumn } from "@useautumn/convex";
import type { ActionCtx, MutationCtx, QueryCtx } from "../_generated/server";
import type { Id as BetterAuthId } from "../betterAuth/_generated/dataModel";

export type ProtectedQueryCtx = QueryCtx & {
  userId: BetterAuthId<"user">;
  email: string | undefined;
  name: string | undefined;
};

export type ProtectedMutationCtx = MutationCtx & {
  userId: BetterAuthId<"user">;
  email: string | undefined;
  name: string | undefined;
};

export type ProtectedActionCtx = ActionCtx & {
  autumn: Autumn;
  userId: BetterAuthId<"user">;
  email: string | undefined;
  name: string | undefined;
};

export enum ErrorSeverity {
  High = "high",
  Medium = "medium",
  Low = "low",
}

export enum SecretValueType {
  String = "string",
  Number = "number",
  Boolean = "boolean",
}

export enum EmailKind {
  AccessRestricted = "access-restricted",
  GracePeriodStarted = "grace-period-started",
  PlanUpgraded = "plan-upgraded",
  Welcome = "welcome",
}
