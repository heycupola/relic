import { v } from "convex/values";
import { doc } from "convex-helpers/validators";
import { components, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Doc as BetterAuthDoc, Id as BetterAuthId } from "./betterAuth/_generated/dataModel";
import { assertProjectAccess } from "./lib/access";
import {
  alreadyExistsError,
  createError,
  ErrorCode,
  notFoundError,
  permissionError,
} from "./lib/errors";
import { protectedMutation, protectedQuery } from "./lib/middleware";
import { checkRateLimit } from "./lib/rateLimit";
import { ErrorSeverity, type ProtectedMutationCtx, type ProtectedQueryCtx } from "./lib/types";
import schema from "./schema";

export const shareProject = protectedMutation({
  args: {
    projectId: v.id("project"),
    userEmail: v.string(),
    encryptedProjectKey: v.string(),
  },
  handler: async (ctx: ProtectedMutationCtx, args) => {
    const project: Doc<"project"> = await ctx.runQuery(internal.project._loadProjectById, {
      projectId: args.projectId,
    });

    await assertProjectAccess(ctx, project);

    if (ctx.userId !== project.ownerId) {
      throw permissionError("share this project", ErrorSeverity.High);
    }

    await checkRateLimit(ctx, "write");

    const targetUser = await ctx.runQuery(components.betterAuth.user.loadUserByEmail, {
      email: args.userEmail,
    });

    if (!targetUser) {
      throw createError({
        code: ErrorCode.USER_NOT_FOUND,
        message: `User with email ${args.userEmail} not found`,
        severity: ErrorSeverity.Medium,
      });
    }

    if (targetUser._id === ctx.userId) {
      throw createError({
        code: ErrorCode.INVALID_OPERATION,
        message: "Cannot share project with yourself",
        severity: ErrorSeverity.Medium,
      });
    }

    if (!targetUser.publicKey) {
      throw createError({
        code: ErrorCode.INVALID_OPERATION,
        message: "Target user has not set up encryption keys yet",
        severity: ErrorSeverity.Medium,
      });
    }

    const existingShare = await ctx.runQuery(
      internal.projectShare._loadActiveShareByProjectAndUser,
      {
        projectId: args.projectId,
        userId: targetUser._id as BetterAuthId<"user">,
      },
    );

    if (existingShare) {
      throw alreadyExistsError("share", ErrorSeverity.Medium);
    }

    const { shareId } = await ctx.runMutation(internal.projectShare._insertProjectShare, {
      projectId: args.projectId,
      userId: targetUser._id as BetterAuthId<"user">,
      encryptedProjectKey: args.encryptedProjectKey,
      sharedBy: ctx.userId,
    });

    await ctx.runMutation(internal.actionLog._insertActionLog, {
      projectId: args.projectId,
      userId: ctx.userId,
      action: "share.added",
      metadata: {
        sharedUserId: targetUser._id,
        sharedUserEmail: targetUser.email,
      },
    });

    return { success: true, shareId };
  },
});

export const revokeShare = protectedMutation({
  args: {
    shareId: v.id("projectShare"),
    newEncryptedProjectKey: v.string(),
    newKeyVersion: v.number(),
    rewrappedShares: v.array(
      v.object({
        shareId: v.id("projectShare"),
        newEncryptedProjectKey: v.string(),
      }),
    ),
  },
  handler: async (ctx: ProtectedMutationCtx, args) => {
    const share: Doc<"projectShare"> = await ctx.runQuery(internal.projectShare._loadShareById, {
      shareId: args.shareId,
    });

    const project: Doc<"project"> = await ctx.runQuery(internal.project._loadProjectById, {
      projectId: share.projectId,
    });

    await assertProjectAccess(ctx, project);

    if (ctx.userId !== project.ownerId) {
      throw permissionError("revoke this share", ErrorSeverity.High);
    }

    if (share.revokedAt !== undefined) {
      throw createError({
        code: ErrorCode.INVALID_OPERATION,
        message: "Share is already revoked",
        severity: ErrorSeverity.Medium,
      });
    }

    await checkRateLimit(ctx, "write");

    await ctx.runMutation(internal.projectShare._revokeProjectShare, {
      shareId: args.shareId,
    });

    const oldKeyVersion = project.keyVersion;
    await ctx.runMutation(internal.project._rotateProjectKey, {
      projectId: share.projectId,
      newEncryptedProjectKey: args.newEncryptedProjectKey,
      newKeyVersion: args.newKeyVersion,
    });

    for (const rewrapped of args.rewrappedShares) {
      const otherShare = await ctx.runQuery(internal.projectShare._loadShareById, {
        shareId: rewrapped.shareId,
      });

      if (otherShare.projectId !== share.projectId) {
        throw createError({
          code: ErrorCode.INVALID_OPERATION,
          message: "Invalid share in rewrappedShares",
          severity: ErrorSeverity.High,
        });
      }

      if (otherShare.revokedAt !== undefined) {
        throw createError({
          code: ErrorCode.INVALID_OPERATION,
          message: "Cannot update revoked share",
          severity: ErrorSeverity.High,
        });
      }

      await ctx.runMutation(internal.projectShare._updateShareKey, {
        shareId: rewrapped.shareId,
        newEncryptedProjectKey: rewrapped.newEncryptedProjectKey,
      });
    }

    await ctx.runMutation(internal.projectShare._insertKeyRotation, {
      projectId: share.projectId,
      oldKeyVersion,
      newKeyVersion: args.newKeyVersion,
      rotatedBy: ctx.userId,
      reason: "share_revoked",
      secretsReEncrypted: 0,
      sharesUpdated: args.rewrappedShares.length,
    });

    const revokedUser = (await ctx.runQuery(components.betterAuth.user.loadUserById, {
      userId: share.userId as BetterAuthId<"user">,
    })) as BetterAuthDoc<"user"> | null;

    await ctx.runMutation(internal.actionLog._insertActionLog, {
      projectId: share.projectId,
      userId: ctx.userId,
      action: "share.revoked",
      metadata: {
        sharedUserId: share.userId,
        sharedUserEmail: revokedUser?.email,
        oldKeyVersion,
        newKeyVersion: args.newKeyVersion,
      },
    });

    return { success: true };
  },
});

export const listProjectShares = protectedQuery({
  args: {
    projectId: v.id("project"),
  },
  handler: async (ctx: ProtectedQueryCtx, args) => {
    const project: Doc<"project"> = await ctx.runQuery(internal.project._loadProjectById, {
      projectId: args.projectId,
    });

    await assertProjectAccess(ctx, project);

    if (ctx.userId !== project.ownerId) {
      throw permissionError("list shares for this project", ErrorSeverity.High);
    }

    const shares: Doc<"projectShare">[] = await ctx.runQuery(
      internal.projectShare._loadActiveSharesByProject,
      {
        projectId: args.projectId,
      },
    );

    const sharesWithUsers = await Promise.all(
      shares.map(async (share: Doc<"projectShare">) => {
        const user = (await ctx.runQuery(components.betterAuth.user.loadUserById, {
          userId: share.userId as BetterAuthId<"user">,
        })) as BetterAuthDoc<"user"> | null;

        const sharedByUser = (await ctx.runQuery(components.betterAuth.user.loadUserById, {
          userId: share.sharedBy as BetterAuthId<"user">,
        })) as BetterAuthDoc<"user"> | null;

        return {
          id: share._id,
          projectId: share.projectId,
          userId: share.userId,
          userEmail: user?.email || "Unknown",
          userName: user?.name || "Unknown",
          sharedBy: share.sharedBy,
          sharedByEmail: sharedByUser?.email || "Unknown",
          sharedAt: share.sharedAt,
          createdAt: share.createdAt,
        };
      }),
    );

    return { shares: sharesWithUsers };
  },
});

export const listSharedWithMe = protectedQuery({
  args: {},
  handler: async (ctx: ProtectedQueryCtx) => {
    const shares: Doc<"projectShare">[] = await ctx.runQuery(
      internal.projectShare._loadActiveSharesByUser,
      {
        userId: ctx.userId,
      },
    );

    const sharesWithProjects = await Promise.all(
      shares.map(async (share: Doc<"projectShare">) => {
        const project: Doc<"project"> = await ctx.runQuery(internal.project._loadProjectById, {
          projectId: share.projectId,
        });

        const owner = (await ctx.runQuery(components.betterAuth.user.loadUserById, {
          userId: project.ownerId as BetterAuthId<"user">,
        })) as BetterAuthDoc<"user"> | null;

        return {
          id: share._id,
          projectId: share.projectId,
          projectName: project.name,
          projectSlug: project.slug,
          ownerId: project.ownerId,
          ownerEmail: owner?.email || "Unknown",
          ownerName: owner?.name || "Unknown",
          sharedAt: share.sharedAt,
          encryptedProjectKey: share.encryptedProjectKey,
        };
      }),
    );

    return { shares: sharesWithProjects };
  },
});

export const getProjectShare = protectedQuery({
  args: {
    projectId: v.id("project"),
  },
  handler: async (ctx: ProtectedQueryCtx, args) => {
    const share: Doc<"projectShare"> | null = await ctx.runQuery(
      internal.projectShare._loadActiveShareByProjectAndUser,
      {
        projectId: args.projectId,
        userId: ctx.userId,
      },
    );

    if (!share) {
      throw notFoundError("share");
    }

    return {
      id: share._id,
      projectId: share.projectId,
      encryptedProjectKey: share.encryptedProjectKey,
      sharedAt: share.sharedAt,
    };
  },
});

export const _loadShareById = internalQuery({
  args: {
    shareId: v.id("projectShare"),
  },
  returns: doc(schema, "projectShare"),
  handler: async (ctx, args) => {
    const share = await ctx.db.get(args.shareId);

    if (!share) {
      throw notFoundError("share");
    }

    return share;
  },
});

export const _loadActiveSharesByProject = internalQuery({
  args: {
    projectId: v.id("project"),
  },
  returns: v.array(doc(schema, "projectShare")),
  handler: async (ctx, args) => {
    const shares = await ctx.db
      .query("projectShare")
      .withIndex("by_project_active", (q) =>
        q.eq("projectId", args.projectId).eq("revokedAt", undefined),
      )
      .collect();

    return shares;
  },
});

export const _loadActiveSharesByUser = internalQuery({
  args: {
    userId: v.id("user"),
  },
  returns: v.array(doc(schema, "projectShare")),
  handler: async (ctx, args) => {
    const shares = await ctx.db
      .query("projectShare")
      .withIndex("by_user", (q) => q.eq("userId", args.userId.toString()))
      .filter((q) => q.eq(q.field("revokedAt"), undefined))
      .collect();

    return shares;
  },
});

export const _loadActiveShareByProjectAndUser = internalQuery({
  args: {
    projectId: v.id("project"),
    userId: v.id("user"),
  },
  returns: v.union(doc(schema, "projectShare"), v.null()),
  handler: async (ctx, args) => {
    const shares = await ctx.db
      .query("projectShare")
      .withIndex("by_project_user", (q) =>
        q.eq("projectId", args.projectId).eq("userId", args.userId.toString()),
      )
      .filter((q) => q.eq(q.field("revokedAt"), undefined))
      .collect();

    return shares[0] || null;
  },
});

export const _insertProjectShare = internalMutation({
  args: {
    projectId: v.id("project"),
    userId: v.id("user"),
    encryptedProjectKey: v.string(),
    sharedBy: v.id("user"),
  },
  returns: v.object({ success: v.boolean(), shareId: v.id("projectShare") }),
  handler: async (ctx, args) => {
    const now = Date.now();

    const shareId = await ctx.db.insert("projectShare", {
      projectId: args.projectId,
      userId: args.userId.toString(),
      encryptedProjectKey: args.encryptedProjectKey,
      sharedBy: args.sharedBy.toString(),
      sharedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    return { success: true, shareId };
  },
});

export const _revokeProjectShare = internalMutation({
  args: {
    shareId: v.id("projectShare"),
  },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.shareId, {
      revokedAt: Date.now(),
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

export const _updateShareKey = internalMutation({
  args: {
    shareId: v.id("projectShare"),
    newEncryptedProjectKey: v.string(),
  },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.shareId, {
      encryptedProjectKey: args.newEncryptedProjectKey,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

export const _insertKeyRotation = internalMutation({
  args: {
    projectId: v.id("project"),
    oldKeyVersion: v.number(),
    newKeyVersion: v.number(),
    rotatedBy: v.id("user"),
    reason: v.optional(v.string()),
    secretsReEncrypted: v.number(),
    sharesUpdated: v.number(),
  },
  returns: v.object({ success: v.boolean(), rotationId: v.id("keyRotation") }),
  handler: async (ctx, args) => {
    const rotationId = await ctx.db.insert("keyRotation", {
      projectId: args.projectId,
      oldKeyVersion: args.oldKeyVersion,
      newKeyVersion: args.newKeyVersion,
      rotatedBy: args.rotatedBy.toString(),
      reason: args.reason,
      secretsReEncrypted: args.secretsReEncrypted,
      sharesUpdated: args.sharesUpdated,
      createdAt: Date.now(),
    });

    return { success: true, rotationId };
  },
});
