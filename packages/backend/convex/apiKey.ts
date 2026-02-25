import { v } from "convex/values";
import { components } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Id as BetterAuthId } from "./betterAuth/_generated/dataModel";
import { extractPrefix, generateRawKey, hashKey } from "./lib/crypto";
import { createError, ErrorCode } from "./lib/errors";
import { createLogger } from "./lib/logger";
import { protectedMutation, protectedQuery } from "./lib/middleware";
import { checkRateLimit } from "./lib/rateLimit";
import type { ProtectedMutationCtx, ProtectedQueryCtx } from "./lib/types";
import { ApiKeyScope, ErrorSeverity, hasScopes, validateScopes } from "./lib/types";

const log = createLogger("apiKey");

const MAX_API_KEYS_PER_USER = 5;

export const createApiKey = protectedMutation({
  args: {
    name: v.string(),
    scopes: v.array(v.string()),
    expiresAt: v.optional(v.number()),
  },
  handler: async (
    ctx: ProtectedMutationCtx,
    args: { name: string; scopes: string[]; expiresAt?: number },
  ): Promise<{ apiKey: string; prefix: string }> => {
    await checkRateLimit(ctx, "write");

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

    const existing = await ctx.db
      .query("apiKey")
      .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
      .collect();

    const activeKeys = existing.filter((k) => !k.revokedAt);
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
      expiresAt: args.expiresAt,
      createdAt: Date.now(),
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

    log.info("API key revoked", { userId: ctx.userId, prefix: key.prefix });

    return { success: true };
  },
});

export const _validateApiKey = internalMutation({
  args: {
    hashedApiKey: v.string(),
    requiredScopes: v.array(v.string()),
    clientIp: v.optional(v.string()),
  },
  returns: v.object({
    userId: v.string(),
  }),
  handler: async (
    ctx,
    args: { hashedApiKey: string; requiredScopes: string[]; clientIp?: string },
  ): Promise<{ userId: string }> => {
    const rateLimitKey = args.clientIp ?? "unknown";
    await checkRateLimit(ctx, "read", `apikey:${rateLimitKey}`);

    const keyDoc = await ctx.db
      .query("apiKey")
      .withIndex("by_hashedKey", (q) => q.eq("hashedKey", args.hashedApiKey))
      .unique();

    if (!keyDoc) {
      throw createError({
        code: ErrorCode.UNAUTHORIZED,
        message: "Invalid API key",
        severity: ErrorSeverity.Medium,
      });
    }

    if (keyDoc.revokedAt) {
      throw createError({
        code: ErrorCode.UNAUTHORIZED,
        message: "API key has been revoked",
        severity: ErrorSeverity.Medium,
      });
    }

    if (keyDoc.expiresAt && keyDoc.expiresAt < Date.now()) {
      throw createError({
        code: ErrorCode.UNAUTHORIZED,
        message: "API key has expired",
        severity: ErrorSeverity.Medium,
      });
    }

    const keyScopes = keyDoc.scopes as ApiKeyScope[];
    const required = args.requiredScopes as ApiKeyScope[];

    if (!hasScopes(keyScopes, required)) {
      const missing = required.filter((r) => !keyScopes.includes(r));
      throw createError({
        code: ErrorCode.INSUFFICIENT_PERMISSION,
        message: `API key missing required scope(s): ${missing.join(", ")}`,
        severity: ErrorSeverity.High,
      });
    }

    await ctx.db.patch(keyDoc._id, { lastUsedAt: Date.now() });

    return { userId: keyDoc.userId };
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
