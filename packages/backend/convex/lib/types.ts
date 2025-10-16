import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

// Context types for protected handlers
export type ProtectedQueryCtx = QueryCtx & { userId: Id<"user"> };
export type ProtectedMutationCtx = MutationCtx & { userId: Id<"user"> };

// Context types for optional handlers (userId might be null)
export type OptionalQueryCtx = QueryCtx & { userId: Id<"user"> | null };
export type OptionalMutationCtx = MutationCtx & { userId: Id<"user"> | null };
