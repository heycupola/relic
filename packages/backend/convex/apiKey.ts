import { v } from "convex/values";
import { hasPaidAccess, MAX_API_KEYS_PER_USER } from "./lib/plans";
import { findUser, getProjectOrThrow } from "./lib/data";
import { components, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Id as BetterAuthId } from "./betterAuth/_generated/dataModel";
import { isProjectAccessible, ProjectAccessReason } from "./lib/access";
import { extractPrefix, generateRawKey, hashKey } from "./lib/crypto";
import {
  type CredentialFailure,
  createError,
  credentialFailure,
  credentialFailureValidator,
  ErrorCode,
} from "./lib/errors";
import { createLogger } from "./lib/logger";
import { protectedMutation, protectedQuery } from "./lib/middleware";
import { checkRateLimit } from "./lib/rateLimit";
import type { ProtectedMutationCtx, ProtectedQueryCtx } from "./lib/types";
import { ApiKeyScope, ErrorSeverity, hasScopes, validateScopes } from "./lib/types";

const log = createLogger("apiKey");

const MAX_EXPIRATION_MS = 365 * 24 * 60 * 60 * 1000;

export const createApiKey = protectedMutation({
  args: {
    name: v.string(),
    scopes: v.array(v.string()),
    expiresAt: v.number(),
    projectId: v.optional(v.id("project")),
  },
  handler: async (
    ctx: ProtectedMutationCtx,
    args: { name: string; scopes: string[]; expiresAt: number; projectId?: Id<"project"> },
  ): Promise<{ apiKey: string; prefix: string }> => {
    await checkRateLimit(ctx, "write");

    const currentUser = await ctx.runQuery(components.betterAuth.user.loadUserById, {
      userId: ctx.userId,
    });
    if (!currentUser?.hasPro) {
      throw createError({
        code: ErrorCode.PRO_PLAN_REQUIRED,
        message:
          "CI/CD integration requires a Pro plan. Consider using service accounts for passwordless access.",
        severity: ErrorSeverity.Medium,
      });
    }

    if (!args.name || args.name.trim().length === 0) {
      throw createError({
        code: ErrorCode.INVALID_ARGUMENTS,
        message: "API key name is required",
        severity: ErrorSeverity.Low,
      });
    }

    if (!validateScopes(args.scopes)) {
      throw createError({
        code: ErrorCode.INVALID_ARGUMENTS,
        message: `Invalid scopes. Valid scopes: ${Object.values(ApiKeyScope).join(", ")}`,
        severity: ErrorSeverity.Low,
      });
    }

    const now = Date.now();

    if (args.expiresAt <= now) {
      throw createError({
        code: ErrorCode.INVALID_ARGUMENTS,
        message: "Expiration must be in the future",
        severity: ErrorSeverity.Low,
      });
    }

    if (args.expiresAt > now + MAX_EXPIRATION_MS) {
      throw createError({
        code: ErrorCode.INVALID_ARGUMENTS,
        message: "Expiration cannot exceed 365 days",
        severity: ErrorSeverity.Low,
      });
    }

    if (args.projectId) {
      const project = await getProjectOrThrow(ctx, args.projectId);
      if (!project) {
        throw createError({
          code: ErrorCode.REQUEST_NOT_FOUND,
          message: "Project not found",
          severity: ErrorSeverity.Medium,
        });
      }

      const { accessible, reason } = await isProjectAccessible(ctx, project);
      if (!accessible) {
        throw createError({
          code:
            reason === ProjectAccessReason.Archived
              ? ErrorCode.INVALID_OPERATION
              : ErrorCode.REQUEST_NOT_FOUND,
          message:
            reason === ProjectAccessReason.Archived
              ? "Cannot scope API key to an archived project"
              : "Project not found or you don't have access",
          severity: ErrorSeverity.Medium,
        });
      }
    }

    const existing = await ctx.db
      .query("apiKey")
      .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
      .collect();

    const activeKeys = existing.filter((k) => !k.revokedAt && (!k.expiresAt || k.expiresAt >= now));
    if (activeKeys.length >= MAX_API_KEYS_PER_USER) {
      throw createError({
        code: ErrorCode.RATE_LIMIT_EXCEEDED,
        message: `Maximum ${MAX_API_KEYS_PER_USER} active API keys allowed`,
        severity: ErrorSeverity.Medium,
      });
    }

    const rawKey = generateRawKey();
    const hashedKey = await hashKey(rawKey);
    const prefix = extractPrefix(rawKey);

    await ctx.db.insert("apiKey", {
      userId: ctx.userId,
      name: args.name.trim(),
      hashedKey,
      prefix,
      scopes: args.scopes,
      projectId: args.projectId,
      expiresAt: args.expiresAt,
      createdAt: now,
    });

    await ctx.runMutation(internal.actionLog._insertActionLog, {
      userId: ctx.userId,
      action: "apikey.created",
      metadata: {
        apiKeyPrefix: prefix,
      },
    });

    log.info("API key created", { userId: ctx.userId, prefix });

    return { apiKey: rawKey, prefix };
  },
});

export const listApiKeys = protectedQuery({
  args: {},
  handler: async (ctx: ProtectedQueryCtx) => {
    const keys = await ctx.db
      .query("apiKey")
      .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
      .collect();

    return keys.map((k) => ({
      id: k._id,
      name: k.name,
      prefix: k.prefix,
      scopes: k.scopes,
      projectId: k.projectId,
      lastUsedAt: k.lastUsedAt,
      expiresAt: k.expiresAt,
      revokedAt: k.revokedAt,
      createdAt: k.createdAt,
    }));
  },
});

export const revokeApiKey = protectedMutation({
  args: {
    apiKeyId: v.id("apiKey"),
  },
  handler: async (ctx: ProtectedMutationCtx, args: { apiKeyId: Id<"apiKey"> }) => {
    await checkRateLimit(ctx, "write");

    const key = await ctx.db.get(args.apiKeyId);

    if (!key || key.userId !== ctx.userId) {
      throw createError({
        code: ErrorCode.REQUEST_NOT_FOUND,
        message: "API key not found",
        severity: ErrorSeverity.Medium,
      });
    }

    if (key.revokedAt) {
      throw createError({
        code: ErrorCode.INVALID_OPERATION,
        message: "API key is already revoked",
        severity: ErrorSeverity.Low,
      });
    }

    await ctx.db.patch(key._id, { revokedAt: Date.now() });

    await ctx.runMutation(internal.actionLog._insertActionLog, {
      userId: ctx.userId,
      action: "apikey.revoked",
      metadata: {
        apiKeyPrefix: key.prefix,
      },
    });

    log.info("API key revoked", { userId: ctx.userId, prefix: key.prefix });

    return { success: true };
  },
});

export const _validateApiKey = internalMutation({
  args: {
    hashedApiKey: v.string(),
    requiredScopes: v.array(v.string()),
    clientIp: v.optional(v.string()),
    requestedProjectId: v.optional(v.string()),
  },
  // Failures are returned rather than thrown so the rate-limit consumption above commits.
  returns: v.union(
    credentialFailureValidator,
    v.object({
      ok: v.literal(true),
      userId: v.string(),
      apiKeyId: v.id("apiKey"),
      projectId: v.optional(v.id("project")),
    }),
  ),
  handler: async (
    ctx,
    args: {
      hashedApiKey: string;
      requiredScopes: string[];
      clientIp?: string;
      requestedProjectId?: string;
    },
  ): Promise<
    | CredentialFailure
    | { ok: true; userId: string; apiKeyId: Id<"apiKey">; projectId?: Id<"project"> }
  > => {
    const rateLimitKey = args.clientIp ?? "unknown";
    await checkRateLimit(ctx, "read", `apikey:${rateLimitKey}`);

    const keyDoc = await ctx.db
      .query("apiKey")
      .withIndex("by_hashedKey", (q) => q.eq("hashedKey", args.hashedApiKey))
      .unique();

    if (!keyDoc) {
      return credentialFailure(ErrorCode.UNAUTHORIZED, "Invalid API key");
    }

    if (keyDoc.revokedAt) {
      return credentialFailure(ErrorCode.UNAUTHORIZED, "API key has been revoked");
    }

    if (keyDoc.expiresAt && keyDoc.expiresAt < Date.now()) {
      return credentialFailure(ErrorCode.UNAUTHORIZED, "API key has expired");
    }

    const keyScopes = keyDoc.scopes as ApiKeyScope[];
    const required = args.requiredScopes as ApiKeyScope[];

    if (!hasScopes(keyScopes, required)) {
      const missing = required.filter((r) => !keyScopes.includes(r));
      return credentialFailure(
        ErrorCode.INSUFFICIENT_PERMISSION,
        `API key missing required scope(s): ${missing.join(", ")}`,
      );
    }

    if (
      keyDoc.projectId &&
      args.requestedProjectId &&
      keyDoc.projectId !== args.requestedProjectId
    ) {
      return credentialFailure(
        ErrorCode.INSUFFICIENT_PERMISSION,
        "API key is scoped to a different project",
      );
    }

    const user = await findUser(ctx, keyDoc.userId);
    if (!user || !hasPaidAccess(user)) {
      return credentialFailure(
        ErrorCode.PRO_PLAN_REQUIRED,
        "CI/CD integration requires a Pro plan. Consider using service accounts for passwordless access.",
        `${process.env.SITE_URL || "https://withrelic.com"}/dashboard?action=upgrade`,
      );
    }

    await ctx.db.patch(keyDoc._id, { lastUsedAt: Date.now() });

    return {
      ok: true as const,
      userId: keyDoc.userId,
      apiKeyId: keyDoc._id,
      projectId: keyDoc.projectId,
    };
  },
});

export const _getUserCryptoKeys = internalQuery({
  args: { userId: v.string() },
  returns: v.object({
    encryptedPrivateKey: v.string(),
    salt: v.string(),
    publicKey: v.string(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ encryptedPrivateKey: string; salt: string; publicKey: string }> => {
    const user = await ctx.runQuery(components.betterAuth.user.loadUserById, {
      userId: args.userId as BetterAuthId<"user">,
    });

    if (!user?.encryptedPrivateKey || !user?.salt || !user?.publicKey) {
      throw createError({
        code: ErrorCode.USER_NOT_FOUND,
        message: "User encryption keys not found",
        severity: ErrorSeverity.High,
      });
    }

    return {
      encryptedPrivateKey: user.encryptedPrivateKey,
      salt: user.salt,
      publicKey: user.publicKey,
    };
  },
});
