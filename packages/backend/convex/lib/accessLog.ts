import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

type ResourceType = "secret" | "project" | "environment" | "organization";
type Action = "viewed" | "created" | "updated" | "deleted" | "exported";

export async function logAccess(
  ctx: MutationCtx & { userId: Id<"user"> },
  resourceType: ResourceType,
  resourceId: string,
  action: Action,
  metadata?: {
    ipAddress?: string;
    userAgent?: string;
  },
): Promise<void> {
  await ctx.db.insert("accessLog", {
    userId: ctx.userId,
    resourceType,
    resourceId,
    action,
    ipAddress: metadata?.ipAddress,
    userAgent: metadata?.userAgent,
    timestamp: Date.now(),
  });
}
