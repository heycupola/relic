import { v } from "convex/values";
import { createError, ErrorCode } from "./errors";
import { ErrorSeverity } from "./types";

export const pushAuditValidator = v.object({
  target: v.string(),
  destination: v.optional(v.string()),
  dryRun: v.optional(v.boolean()),
});

export type PushAudit = {
  target: string;
  destination?: string;
  dryRun?: boolean;
};

const PUSH_TARGET_PATTERN = /^[a-z][a-z0-9-]{0,31}$/;
export const MAX_PUSH_DESTINATION_LENGTH = 200;

export function buildExportAudit(push: PushAudit | undefined): {
  action: "secret.exported" | "secrets.pushed";
  metadata: { pushTarget?: string; pushDestination?: string; pushDryRun?: boolean };
} {
  if (!push) {
    return { action: "secret.exported", metadata: {} };
  }

  if (!PUSH_TARGET_PATTERN.test(push.target)) {
    createError({
      code: ErrorCode.INVALID_ARGUMENTS,
      message: "Invalid push target",
      severity: ErrorSeverity.Medium,
    });
  }

  if (push.destination !== undefined && push.destination.length > MAX_PUSH_DESTINATION_LENGTH) {
    createError({
      code: ErrorCode.INVALID_ARGUMENTS,
      message: `Push destination must be at most ${MAX_PUSH_DESTINATION_LENGTH} characters`,
      severity: ErrorSeverity.Medium,
    });
  }

  return {
    action: "secrets.pushed",
    metadata: {
      pushTarget: push.target,
      pushDestination: push.destination,
      pushDryRun: push.dryRun ? true : undefined,
    },
  };
}

export function parsePushAudit(value: unknown): PushAudit | undefined {
  if (value === undefined || value === null) return undefined;

  const { target, destination, dryRun } =
    typeof value === "object"
      ? (value as Record<string, unknown>)
      : ({} as Record<string, unknown>);

  if (
    typeof target !== "string" ||
    (destination !== undefined && typeof destination !== "string") ||
    (dryRun !== undefined && typeof dryRun !== "boolean")
  ) {
    createError({
      code: ErrorCode.INVALID_ARGUMENTS,
      message: "push must be { target: string, destination?: string, dryRun?: boolean }",
      severity: ErrorSeverity.Medium,
    });
  }

  return { target, destination, dryRun };
}

const SECRET_SCOPES = ["client", "server", "shared"] as const;
type SecretScope = (typeof SECRET_SCOPES)[number];

export function parseScopes(value: unknown): SecretScope[] | undefined {
  if (value === undefined || value === null) return undefined;

  if (
    !Array.isArray(value) ||
    !value.every((scope) => SECRET_SCOPES.includes(scope as SecretScope))
  ) {
    createError({
      code: ErrorCode.INVALID_ARGUMENTS,
      message: "scopes must be an array of client, server, or shared",
      severity: ErrorSeverity.Medium,
    });
  }

  return value as SecretScope[];
}
