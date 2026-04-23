import type { RunMutationCtx } from "@convex-dev/rate-limiter";
import type { GenericActionCtx, GenericMutationCtx } from "convex/server";
import type { DataModel } from "../_generated/dataModel";
import { rateLimiter } from "../rateLimiter";
import { createError, ErrorCode } from "./errors";
import { createLogger } from "./logger";
import type { ProtectedActionCtx, ProtectedMutationCtx } from "./types";

const log = createLogger("rateLimit");

type OperationType =
  | "read"
  | "write"
  | "delete"
  | "bulk"
  | "keyRotation"
  | "apiKeyExport"
  | "serviceAccountExport";

export async function checkRateLimit(
  ctx: ProtectedMutationCtx,
  type: OperationType,
  key?: string,
): Promise<void>;

export async function checkRateLimit(
  ctx: ProtectedActionCtx,
  type: OperationType,
  key?: string,
): Promise<void>;

export async function checkRateLimit(
  ctx: GenericMutationCtx<DataModel>,
  type: OperationType,
  key?: string,
): Promise<void>;

export async function checkRateLimit(
  ctx: GenericActionCtx<DataModel>,
  type: OperationType,
  key?: string,
): Promise<void>;

export async function checkRateLimit(
  ctx:
    | ProtectedMutationCtx
    | ProtectedActionCtx
    | GenericMutationCtx<DataModel>
    | GenericActionCtx<DataModel>,
  type: OperationType,
  key?: string,
) {
  const limitMap = {
    read: "readOperation",
    write: "writeOperation",
    delete: "deleteOperation",
    bulk: "bulkOperation",
    keyRotation: "keyRotation",
    apiKeyExport: "apiKeyExport",
    serviceAccountExport: "serviceAccountExport",
  } as const;

  const rateLimitKey = key || (ctx as ProtectedMutationCtx).userId;

  if (!rateLimitKey) {
    throw createError({
      code: ErrorCode.SERVER_ERROR,
      message: "Rate limit key is required",
    });
  }

  const status = await rateLimiter.limit(ctx as RunMutationCtx, limitMap[type], {
    key: rateLimitKey,
  });

  if (!status.ok) {
    const seconds = Math.ceil(status.retryAfter / 1000);

    log.warn("Rate limit exceeded", { type, key: rateLimitKey, retryAfterSeconds: seconds });

    throw createError({
      code: ErrorCode.RATE_LIMIT_EXCEEDED,
      message: `Too many requests. Please wait ${seconds} second${seconds > 1 ? "s" : ""}.`,
      metadata: {
        type,
        retryAfter: status.retryAfter,
        retryAfterSeconds: seconds,
      },
    });
  }
}
