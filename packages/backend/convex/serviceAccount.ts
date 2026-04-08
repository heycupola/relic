import { v } from "convex/values";
import { doc } from "convex-helpers/validators";
import { components, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import { assertProjectAccess } from "./lib/access";
import { createError, ErrorCode, permissionError } from "./lib/errors";
import { createLogger } from "./lib/logger";
import { protectedMutation, protectedQuery } from "./lib/middleware";
import { checkRateLimit } from "./lib/rateLimit";
import { ErrorSeverity, type ProtectedMutationCtx, type ProtectedQueryCtx } from "./lib/types";
import schema from "./schema";

const log = createLogger("serviceAccount");

const MAX_SERVICE_ACCOUNTS_PER_PROJECT = 5;
const MAX_EXPIRATION_MS = 365 * 24 * 60 * 60 * 1000;

export const createServiceAccount = protectedMutation({
  args: {
    projectId: v.id("project"),
    name: v.string(),
    publicKey: v.string(),
    encryptedPrivateKey: v.string(),
    salt: v.string(),
    encryptedProjectKey: v.string(),
    hashedToken: v.string(),
    tokenPrefix: v.string(),
    expiresAt: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args: {
      projectId: Id<"project">;
      name: string;
      publicKey: string;
      encryptedPrivateKey: string;
      salt: string;
      encryptedProjectKey: string;
      hashedToken: string;
      tokenPrefix: string;
      expiresAt?: number;
    },
  ): Promise<{ id: Id<"serviceAccount">; tokenPrefix: string }> => {
    await checkRateLimit(ctx, "write");

    const currentUser = await ctx.runQuery(components.betterAuth.user.loadUserById, {
      userId: ctx.userId,
    });
    if (!currentUser?.hasPro) {
      throw createError({
        code: ErrorCode.PRO_PLAN_REQUIRED,
        message: "Service accounts require a Pro plan.",
        severity: ErrorSeverity.Medium,
      });
    }

    const project = await ctx.runQuery(internal.project._loadProjectById, {
      projectId: args.projectId,
    });
    await assertProjectAccess(ctx, project);

    if (ctx.userId !== project.ownerId) {
      throw permissionError("create service accounts for this project", ErrorSeverity.High);
    }

    if (!args.name || args.name.trim().length === 0) {
      throw createError({
        code: ErrorCode.INVALID_ARGUMENTS,
        message: "Service account name is required",
        severity: ErrorSeverity.Low,
      });
    }

    const now = Date.now();

    if (args.expiresAt !== undefined) {
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
    }

    const existing = await ctx.db
      .query("serviceAccount")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    const active = existing.filter((sa) => !sa.revokedAt && (!sa.expiresAt || sa.expiresAt >= now));
    if (active.length >= MAX_SERVICE_ACCOUNTS_PER_PROJECT) {
      throw createError({
        code: ErrorCode.RATE_LIMIT_EXCEEDED,
        message: `Maximum ${MAX_SERVICE_ACCOUNTS_PER_PROJECT} active service accounts per project`,
        severity: ErrorSeverity.Medium,
      });
    }

    const existingToken = await ctx.db
      .query("serviceAccount")
      .withIndex("by_hashedToken", (q) => q.eq("hashedToken", args.hashedToken))
      .unique();
    if (existingToken) {
      throw createError({
        code: ErrorCode.RESOURCE_ALREADY_EXISTS,
        message: "Token collision detected. Please retry.",
        severity: ErrorSeverity.High,
      });
    }

    const saId = await ctx.db.insert("serviceAccount", {
      projectId: args.projectId,
      name: args.name.trim(),
      publicKey: args.publicKey,
      encryptedPrivateKey: args.encryptedPrivateKey,
      salt: args.salt,
      encryptedProjectKey: args.encryptedProjectKey,
      hashedToken: args.hashedToken,
      tokenPrefix: args.tokenPrefix,
      createdBy: ctx.userId,
      expiresAt: args.expiresAt,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.runMutation(internal.actionLog._insertActionLog, {
      projectId: args.projectId,
      projectName: project.name,
      userId: ctx.userId,
      action: "serviceaccount.created",
      metadata: { apiKeyPrefix: args.tokenPrefix },
    });

    log.info("Service account created", {
      serviceAccountId: saId,
      projectId: args.projectId,
      userId: ctx.userId,
    });

    return { id: saId, tokenPrefix: args.tokenPrefix };
  },
});

export const listServiceAccounts = protectedQuery({
  args: {
    projectId: v.id("project"),
  },
  handler: async (ctx: ProtectedQueryCtx, args: { projectId: Id<"project"> }) => {
    const project = await ctx.runQuery(internal.project._loadProjectById, {
      projectId: args.projectId,
    });
    await assertProjectAccess(ctx, project);

    const accounts = await ctx.db
      .query("serviceAccount")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    return accounts.map((sa) => ({
      id: sa._id,
      name: sa.name,
      tokenPrefix: sa.tokenPrefix,
      expiresAt: sa.expiresAt,
      revokedAt: sa.revokedAt,
      lastUsedAt: sa.lastUsedAt,
      createdAt: sa.createdAt,
    }));
  },
});

export const revokeServiceAccount = protectedMutation({
  args: {
    serviceAccountId: v.id("serviceAccount"),
  },
  handler: async (ctx: ProtectedMutationCtx, args: { serviceAccountId: Id<"serviceAccount"> }) => {
    await checkRateLimit(ctx, "write");

    const sa = await ctx.db.get(args.serviceAccountId);
    if (!sa) {
      throw createError({
        code: ErrorCode.REQUEST_NOT_FOUND,
        message: "Service account not found",
        severity: ErrorSeverity.Medium,
      });
    }

    const project = await ctx.runQuery(internal.project._loadProjectById, {
      projectId: sa.projectId,
    });

    if (ctx.userId !== project.ownerId) {
      throw permissionError("revoke this service account", ErrorSeverity.High);
    }

    if (sa.revokedAt) {
      throw createError({
        code: ErrorCode.INVALID_OPERATION,
        message: "Service account is already revoked",
        severity: ErrorSeverity.Low,
      });
    }

    await ctx.db.patch(sa._id, { revokedAt: Date.now(), updatedAt: Date.now() });

    await ctx.runMutation(internal.actionLog._insertActionLog, {
      projectId: sa.projectId,
      projectName: project.name,
      userId: ctx.userId,
      action: "serviceaccount.revoked",
      metadata: { apiKeyPrefix: sa.tokenPrefix },
    });

    log.info("Service account revoked", {
      serviceAccountId: sa._id,
      projectId: sa.projectId,
      userId: ctx.userId,
    });

    return { success: true };
  },
});

export const _validateServiceToken = internalMutation({
  args: {
    hashedToken: v.string(),
    clientIp: v.optional(v.string()),
  },
  returns: v.object({
    serviceAccountId: v.id("serviceAccount"),
    projectId: v.id("project"),
    encryptedPrivateKey: v.string(),
    salt: v.string(),
    encryptedProjectKey: v.string(),
    publicKey: v.string(),
  }),
  handler: async (ctx, args) => {
    const rateLimitKey = args.clientIp ?? "unknown";
    await checkRateLimit(ctx, "read", `sa:${rateLimitKey}`);

    const sa = await ctx.db
      .query("serviceAccount")
      .withIndex("by_hashedToken", (q) => q.eq("hashedToken", args.hashedToken))
      .unique();

    if (!sa) {
      throw createError({
        code: ErrorCode.UNAUTHORIZED,
        message: "Invalid service token",
        severity: ErrorSeverity.Medium,
      });
    }

    if (sa.revokedAt) {
      throw createError({
        code: ErrorCode.UNAUTHORIZED,
        message: "Service account has been revoked",
        severity: ErrorSeverity.Medium,
      });
    }

    if (sa.expiresAt && sa.expiresAt < Date.now()) {
      throw createError({
        code: ErrorCode.UNAUTHORIZED,
        message: "Service account token has expired",
        severity: ErrorSeverity.Medium,
      });
    }

    const project = await ctx.runQuery(internal.project._loadProjectById, {
      projectId: sa.projectId,
    });

    if (project.isArchived) {
      throw createError({
        code: ErrorCode.PROJECT_INACCESSIBLE,
        message: "Project is archived",
        severity: ErrorSeverity.Medium,
      });
    }

    const owner = await ctx.runQuery(components.betterAuth.user.loadUserById, {
      userId: project.ownerId,
    });
    if (!owner?.hasPro) {
      throw createError({
        code: ErrorCode.PRO_PLAN_REQUIRED,
        message: "Service accounts require the project owner to have a Pro plan.",
        severity: ErrorSeverity.Medium,
      });
    }

    await ctx.db.patch(sa._id, { lastUsedAt: Date.now() });

    return {
      serviceAccountId: sa._id,
      projectId: sa.projectId,
      encryptedPrivateKey: sa.encryptedPrivateKey,
      salt: sa.salt,
      encryptedProjectKey: sa.encryptedProjectKey,
      publicKey: sa.publicKey,
    };
  },
});

export const _loadActiveServiceAccountsByProject = internalQuery({
  args: {
    projectId: v.id("project"),
  },
  returns: v.array(doc(schema, "serviceAccount")),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("serviceAccount")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .filter((q) => q.eq(q.field("revokedAt"), undefined))
      .collect();
  },
});

export const _updateServiceAccountProjectKey = internalMutation({
  args: {
    serviceAccountId: v.id("serviceAccount"),
    newEncryptedProjectKey: v.string(),
  },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.serviceAccountId, {
      encryptedProjectKey: args.newEncryptedProjectKey,
      updatedAt: Date.now(),
    });
    return { success: true };
  },
});
