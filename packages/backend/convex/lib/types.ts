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

export enum ApiKeyScope {
  SecretsRead = "secrets.read",
}

const API_KEY_SCOPE_VALUES = Object.values(ApiKeyScope) as string[];

export function isValidScope(scope: string): scope is ApiKeyScope {
  return API_KEY_SCOPE_VALUES.includes(scope);
}

export function validateScopes(scopes: string[]): scopes is ApiKeyScope[] {
  return scopes.length > 0 && scopes.every(isValidScope);
}

export function hasScopes(scopes: ApiKeyScope[], required: ApiKeyScope[]): boolean {
  return required.every((r) => scopes.includes(r));
}

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
  CollaboratorAdded = "collaborator-added",
  GracePeriodStarted = "grace-period-started",
  PlanUpgraded = "plan-upgraded",
  Welcome = "welcome",
}
