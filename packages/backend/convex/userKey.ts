import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { createError, ErrorCode, notFoundError, permissionError } from "./lib/errors";
import { createLogger } from "./lib/logger";
import { protectedMutation, protectedQuery } from "./lib/middleware";
import { checkRateLimit } from "./lib/rateLimit";
import { ErrorSeverity, type ProtectedMutationCtx, type ProtectedQueryCtx } from "./lib/types";

const log = createLogger("userKey");

export const storeUserKeys = protectedMutation({
  args: {
    publicKey: v.string(),
    encryptedPrivateKey: v.string(),
    salt: v.string(),
  },
  handler: async (
    ctx: ProtectedMutationCtx,
    args: { publicKey: string; encryptedPrivateKey: string; salt: string },
  ) => {
    await checkRateLimit(ctx, "write");

    const user = await ctx.runQuery(components.betterAuth.user.loadUserById, {
      userId: ctx.userId,
    });

    if (user.publicKey || user.encryptedPrivateKey) {
      throw createError({
        code: ErrorCode.INVALID_OPERATION,
        message: "User already has keys. Use updatePassword or rotateUserKeys instead.",
        severity: ErrorSeverity.Medium,
      });
    }

    await ctx.runMutation(components.betterAuth.user.setKeysAndSalt, {
      userId: ctx.userId,
      publicKey: args.publicKey,
      encryptedPrivateKey: args.encryptedPrivateKey,
      salt: args.salt,
    });

    await ctx.runMutation(internal.actionLog._insertActionLog, {
      userId: ctx.userId,
      action: "user.keys_created",
      metadata: {
        reason: "initial_setup",
      },
    });

    return { success: true };
  },
});

export const updatePassword = protectedMutation({
  args: {
    newEncryptedPrivateKey: v.string(),
    newSalt: v.string(),
  },
  handler: async (
    ctx: ProtectedMutationCtx,
    args: { newEncryptedPrivateKey: string; newSalt: string },
  ) => {
    await checkRateLimit(ctx, "write");

    const user = await ctx.runQuery(components.betterAuth.user.loadUserById, {
      userId: ctx.userId,
    });

    if (!user.publicKey) {
      throw createError({
        code: ErrorCode.INVALID_OPERATION,
        message: "User has no keys yet. Use storeUserKeys instead.",
        severity: ErrorSeverity.Medium,
      });
    }

    await ctx.runMutation(components.betterAuth.user.setKeysAndSalt, {
      userId: ctx.userId,
      publicKey: user.publicKey,
      encryptedPrivateKey: args.newEncryptedPrivateKey,
      salt: args.newSalt,
    });

    await ctx.runMutation(internal.actionLog._insertActionLog, {
      userId: ctx.userId,
      action: "user.password_changed",
      metadata: {
        reason: "password_update",
      },
    });

    return { success: true };
  },
});

export const rotateUserKeys = protectedMutation({
  args: {
    newPublicKey: v.string(),
    newEncryptedPrivateKey: v.string(),
    newSalt: v.string(),
    rewrappedShares: v.array(
      v.object({
        shareId: v.id("projectShare"),
        newEncryptedProjectKey: v.string(),
      }),
    ),
    rewrappedOwnedProjects: v.array(
      v.object({
        projectId: v.id("project"),
        newEncryptedProjectKey: v.string(),
      }),
    ),
  },
  handler: async (
    ctx: ProtectedMutationCtx,
    args: {
      newPublicKey: string;
      newEncryptedPrivateKey: string;
      newSalt: string;
      rewrappedShares: Array<{ shareId: Id<"projectShare">; newEncryptedProjectKey: string }>;
      rewrappedOwnedProjects: Array<{ projectId: Id<"project">; newEncryptedProjectKey: string }>;
    },
  ) => {
    await checkRateLimit(ctx, "write");

    for (const rewrapped of args.rewrappedShares) {
      const share = await ctx.db.get(rewrapped.shareId);

      if (!share) {
        throw notFoundError("share");
      }

      const shareDoc = share as Doc<"projectShare">;
      if (shareDoc.userId !== ctx.userId) {
        throw permissionError("update this share");
      }

      if (shareDoc.revokedAt !== undefined) {
        throw createError({
          code: ErrorCode.INVALID_OPERATION,
          message: `Cannot rewrap revoked share: ${rewrapped.shareId}`,
          severity: ErrorSeverity.High,
          metadata: { shareId: rewrapped.shareId },
        });
      }
    }

    for (const rewrapped of args.rewrappedOwnedProjects) {
      const project = await ctx.db.get(rewrapped.projectId);

      if (!project) {
        throw notFoundError("project");
      }

      const projectDoc = project as Doc<"project">;
      if (projectDoc.ownerId !== ctx.userId) {
        throw permissionError("update this project");
      }

      if (projectDoc.isArchived) {
        throw createError({
          code: ErrorCode.INVALID_OPERATION,
          message: `Cannot rewrap archived project: ${rewrapped.projectId}`,
          severity: ErrorSeverity.High,
          metadata: { projectId: rewrapped.projectId },
        });
      }
    }

    await ctx.runMutation(components.betterAuth.user.setKeysAndSalt, {
      userId: ctx.userId,
      publicKey: args.newPublicKey,
      encryptedPrivateKey: args.newEncryptedPrivateKey,
      salt: args.newSalt,
    });

    const now = Date.now();
    let sharesUpdatedCount = 0;
    let projectsUpdatedCount = 0;

    for (const rewrapped of args.rewrappedShares) {
      await ctx.db.patch(rewrapped.shareId, {
        encryptedProjectKey: rewrapped.newEncryptedProjectKey,
        updatedAt: now,
      });

      const share = await ctx.db.get(rewrapped.shareId);

      if (!share) {
        throw notFoundError("share");
      }

      const shareDoc = share as Doc<"projectShare">;
      const shareProject = await ctx.db.get(shareDoc.projectId);

      await ctx.runMutation(internal.actionLog._insertActionLog, {
        projectId: shareDoc.projectId,
        projectName: (shareProject as Doc<"project"> | null)?.name,
        userId: ctx.userId,
        action: "share.key_updated",
        metadata: {
          shareId: rewrapped.shareId,
          reason: "user_rsa_key_rotation",
        },
      });

      sharesUpdatedCount++;
    }

    for (const rewrapped of args.rewrappedOwnedProjects) {
      await ctx.db.patch(rewrapped.projectId, {
        encryptedProjectKey: rewrapped.newEncryptedProjectKey,
        updatedAt: now,
      });

      const ownedProject = await ctx.db.get(rewrapped.projectId);

      await ctx.runMutation(internal.actionLog._insertActionLog, {
        projectId: rewrapped.projectId,
        projectName: (ownedProject as Doc<"project"> | null)?.name,
        userId: ctx.userId,
        action: "project.key_rotated",
        metadata: {
          reason: "user_rsa_key_rotation",
        },
      });

      projectsUpdatedCount++;
    }

    log.info("User keys rotated", {
      userId: ctx.userId,
      sharesUpdated: sharesUpdatedCount,
      ownedProjectsUpdated: projectsUpdatedCount,
    });

    return {
      success: true,
      sharesUpdated: sharesUpdatedCount,
      ownedProjectsUpdated: projectsUpdatedCount,
    };
  },
});

export const hasUserKeys = protectedQuery({
  args: {},
  handler: async (ctx: ProtectedQueryCtx) => {
    const user = await ctx.runQuery(components.betterAuth.user.loadUserById, {
      userId: ctx.userId,
    });

    return { hasKeys: user.publicKey !== undefined && user.encryptedPrivateKey !== undefined };
  },
});
