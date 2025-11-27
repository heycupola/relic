import type { RunMutationCtx } from "@convex-dev/rate-limiter";
import type { GenericActionCtx, GenericMutationCtx, GenericQueryCtx } from "convex/server";
import { ConvexError } from "convex/values";
import type { DataModel } from "../_generated/dataModel";
import { rateLimiter } from "../rateLimiter";
import { createError, ErrorCode } from "./errors";
import type { ProtectedActionCtx, ProtectedMutationCtx, ProtectedQueryCtx } from "./types";

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
  ctx: ProtectedActionCtx,
  type: OperationType,
  key?: string,
): Promise<void>;

export async function checkRateLimit(
  ctx: GenericQueryCtx<DataModel>,
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
    | ProtectedQueryCtx
    | ProtectedMutationCtx
    | ProtectedActionCtx
    | GenericMutationCtx<DataModel>
    | GenericQueryCtx<DataModel>
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
  } as const;

  const rateLimitKey = key || (ctx as ProtectedMutationCtx | ProtectedQueryCtx).userId;

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
