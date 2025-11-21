import type { Autumn } from "@useautumn/convex";
import type { ActionCtx, MutationCtx, QueryCtx } from "../_generated/server";
import type { Id as BetterAuthId } from "../betterAuth/_generated/dataModel";

export type ProtectedQueryCtx = QueryCtx & {
  userId: BetterAuthId<"user">;
  email: string | undefined;
};

export type ProtectedMutationCtx = MutationCtx & {
  userId: BetterAuthId<"user">;
  email: string | undefined;
};

export type ProtectedActionCtx = ActionCtx & {
  autumn: Autumn;
  userId: BetterAuthId<"user">;
  email: string | undefined;
};

export enum ErrorSeverity {
  High = "high",
  Medium = "medium",
  Low = "low",
}

export enum ProjectOwner {
  User = "user",
  Organization = "organization",
}

export enum ResourceType {
  Organization = "organization",
  Project = "project",
  Environment = "environment",
  Folder = "folder",
  Secret = "secret",
}

export enum RotationReason {
  MemberRemoved = "member_removed",
  Scheduled = "scheduled",
  Manual = "manual",
}
