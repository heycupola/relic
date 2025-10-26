import type { RunMutationCtx } from "@convex-dev/rate-limiter";
import { ConvexError } from "convex/values";
import { rateLimiter } from "../rateLimiter";
import type { ProtectedMutationCtx, ProtectedQueryCtx } from "./types";

type OperationType = "read" | "write" | "delete" | "bulk" | "keyRotation";

export async function checkRateLimit(
  ctx: ProtectedQueryCtx,
  type: OperationType,
  key?: string,
): Promise<void>;

export async function checkRateLimit(
  ctx: ProtectedMutationCtx,
  type: OperationType,
  key?: string,
): Promise<void>;

export async function checkRateLimit(
  ctx: ProtectedQueryCtx | ProtectedMutationCtx,
  type: OperationType,
  key?: string,
) {
  const limitMap = {
    read: "readOperation",
    write: "writeOperation",
    delete: "deleteOperation",
    bulk: "bulkOperation",
    keyRotation: "keyRotation",
  } as const;

  const status = await rateLimiter.limit(ctx as RunMutationCtx, limitMap[type], {
    key: key || ctx.userId,
  });

  if (!status.ok) {
    const seconds = Math.ceil(status.retryAfter / 1000);

    throw new ConvexError({
      code: "RATE_LIMIT_EXCEEDED",
      type,
      retryAfter: status.retryAfter,
      retryAfterSeconds: seconds,
      message: `Too many requests. Please wait ${seconds} second${seconds > 1 ? "s" : ""}.`,
    });
  }
}
