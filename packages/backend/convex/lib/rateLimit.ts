import type { ActionCtx, MutationCtx } from "../_generated/server";
import { rateLimiter } from "../rateLimiter";
import { createError, ErrorCode } from "./errors";
import { createLogger } from "./logger";

const log = createLogger("rateLimit");

const LIMITS = {
  read: "readOperation",
  write: "writeOperation",
  delete: "deleteOperation",
  bulk: "bulkOperation",
  keyRotation: "keyRotation",
  deviceCodeRequest: "deviceCodeRequest",
  deviceAuthDecision: "deviceAuthDecision",
  apiKeyExport: "apiKeyExport",
  serviceAccountExport: "serviceAccountExport",
} as const;

type OperationType = keyof typeof LIMITS;

/** Throws RATE_LIMIT_EXCEEDED when the caller (or `key`) is over the limit for this operation. */
export async function checkRateLimit(
  ctx: (MutationCtx | ActionCtx) & { userId?: string },
  type: OperationType,
  key?: string,
): Promise<void> {
  const rateLimitKey = key || ctx.userId;

  if (!rateLimitKey) {
    createError({
      code: ErrorCode.SERVER_ERROR,
      message: "Rate limit key is required",
    });
  }

  const status = await rateLimiter.limit(ctx, LIMITS[type], { key: rateLimitKey });
  if (status.ok) return;

  const seconds = Math.ceil(status.retryAfter / 1000);
  log.warn("Rate limit exceeded", { type, key: rateLimitKey, retryAfterSeconds: seconds });

  createError({
    code: ErrorCode.RATE_LIMIT_EXCEEDED,
    message: `Too many requests. Please wait ${seconds} second${seconds > 1 ? "s" : ""}.`,
    metadata: { type, retryAfter: status.retryAfter, retryAfterSeconds: seconds },
  });
}
