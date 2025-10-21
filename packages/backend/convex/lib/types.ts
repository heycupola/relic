import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export type ProtectedQueryCtx = QueryCtx & { userId: Id<"user"> };
export type ProtectedMutationCtx = MutationCtx & { userId: Id<"user"> };

export type OptionalQueryCtx = QueryCtx & { userId: Id<"user"> | null };
export type OptionalMutationCtx = MutationCtx & { userId: Id<"user"> | null };
