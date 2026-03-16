import { v } from "convex/values";
import { doc } from "convex-helpers/validators";
import { components, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Doc as BetterAuthDoc, Id as BetterAuthId } from "./betterAuth/_generated/dataModel";
import { assertProjectAccess, isProjectAccessible } from "./lib/access";
import {
  alreadyExistsError,
  createError,
  ErrorCode,
  notFoundError,
  permissionError,
} from "./lib/errors";
import { createLogger } from "./lib/logger";
import { protectedAction, protectedQuery } from "./lib/middleware";
import { checkRateLimit } from "./lib/rateLimit";
import {
  EmailKind,
  ErrorSeverity,
  type ProtectedActionCtx,
  type ProtectedQueryCtx,
} from "./lib/types";
import { sendEmail } from "./resend";
import schema from "./schema";

const log = createLogger("projectShare");

export const shareLimits = {
  freeShareLimit: 5,
};

export const getShareLimits = protectedAction({
  args: {
    projectId: v.id("project"),
  },
  handler: async (ctx: ProtectedActionCtx, args: { projectId: Id<"project"> }) => {
    const project: Doc<"project"> = await ctx.runQuery(internal.project._loadProjectById, {
      projectId: args.projectId,
    });

    await assertProjectAccess(ctx, project);

    const user = await ctx.runQuery(components.betterAuth.user.loadUserById, {
      userId: ctx.userId,
    });

    const totalSharesCount = project.shareUsageCount ?? 0;

    // If user doesn't have pro, they can't share - return actual count but 0 limits
    if (!user.hasPro) {
      return {
        hasPro: false,
        freeShareLimit: shareLimits.freeShareLimit,
        purchasedSharesCount: 0,
        totalSharesCount,
        unusedShares: 0,
      };
    }

    const additionalShares = await ctx.autumn.check(ctx, {
      featureId: "additional_shares",
    });

    let unusedShares = 0;

    if (additionalShares.data && !additionalShares.error && additionalShares.data.balance) {
      unusedShares = additionalShares.data.balance;
    }

    // purchasedSharesCount = shares used beyond the free limit
    // Example: freeShareLimit = 5, totalSharesCount = 7 => purchasedSharesCount = 2
    const purchasedSharesCount = Math.max(0, totalSharesCount - shareLimits.freeShareLimit);

    return {
      hasPro: true,
      freeShareLimit: shareLimits.freeShareLimit,
      purchasedSharesCount,
      totalSharesCount,
      unusedShares,
    };
  },
});

export const shareProject = protectedAction({
  args: {
    projectId: v.id("project"),
    userEmail: v.string(),
    encryptedProjectKey: v.string(),
    confirmPayment: v.optional(v.boolean()),
  },
  handler: async (
    ctx: ProtectedActionCtx,
    args: {
      projectId: Id<"project">;
      userEmail: string;
      encryptedProjectKey: string;
      confirmPayment?: boolean;
    },
  ) => {
    await checkRateLimit(ctx, "write");

    const emailRegex =
      /^[a-zA-Z0-9](?:[a-zA-Z0-9._-]*[a-zA-Z0-9])?@[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z]{2,})+$/;
    if (!emailRegex.test(args.userEmail)) {
      throw createError({
        code: ErrorCode.INVALID_OPERATION,
        message: "Invalid email address format",
        severity: ErrorSeverity.Medium,
      });
    }

    const project: Doc<"project"> = await ctx.runQuery(internal.project._loadProjectById, {
      projectId: args.projectId,
    });

    await assertProjectAccess(ctx, project);

    if (ctx.userId !== project.ownerId) {
      throw permissionError("share this project", ErrorSeverity.High);
    }

    const canShare = await ctx.autumn.check(ctx, {
      featureId: "can_share_project",
    });

    if (!canShare.data?.allowed) {
      const checkoutResult = await ctx.autumn.checkout(ctx, {
        productId: "pro_plan",
        successUrl: `${process.env.SITE_URL || "https://relic.so"}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
        customerData: {
          name: ctx.name,
          email: ctx.email,
        },
        checkoutSessionParams: {
          cancel_url: `${process.env.SITE_URL || "https://relic.so"}/subscription/cancel`,
          metadata: {
            userId: ctx.userId,
          },
        },
      });

      return {
        success: false,
        requiresProPlan: true,
        checkoutUrl: checkoutResult.data?.url || null,
        message: "Pro plan required to share projects",
      };
    }

    const additionalShares = await ctx.autumn.check(ctx, {
      featureId: "additional_shares",
    });

    if (additionalShares.data && !additionalShares.error) {
      const usage = additionalShares.data.usage ?? 0;
      const includedUsage = additionalShares.data.included_usage ?? 0;

      if (usage > includedUsage) {
        const excessCount = usage - includedUsage;
        return {
          success: false,
          requiresRemoval: true,
          currentUsage: usage,
          includedUsage: includedUsage,
          excessCount: excessCount,
          message: `You're using ${usage} paid shares across all projects but only have ${includedUsage} included. Please revoke ${excessCount} share(s) from any project to continue.`,
        };
      }
    }

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

    const currentUsage = project.shareUsageCount ?? 0;
    const isPaidShare = currentUsage >= shareLimits.freeShareLimit;

    if (isPaidShare && !args.confirmPayment) {
      return {
        success: false,
        requiresConfirmation: true,
        freeLimit: shareLimits.freeShareLimit,
        message: "Adding a share costs $5. Confirm to proceed.",
      };
    }

    if (!args.encryptedProjectKey || args.encryptedProjectKey.trim() === "") {
      throw createError({
        code: ErrorCode.INVALID_OPERATION,
        message: "Encrypted project key is required to share a project",
        severity: ErrorSeverity.High,
      });
    }

    const { shareId } = await ctx.runMutation(internal.projectShare._insertProjectShare, {
      projectId: args.projectId,
      userId: targetUser._id,
      encryptedProjectKey: args.encryptedProjectKey,
      sharedBy: ctx.userId,
    });

    const sId: Id<"projectShare"> = shareId;

    await ctx.runMutation(internal.projectShare._trackShareUsageCount, {
      projectId: project._id,
      value: 1,
    });

    if (isPaidShare) {
      try {
        await ctx.autumn.track(ctx, {
          featureId: "additional_shares",
          value: 1,
        });
      } catch (trackError) {
        log.error("Payment tracking failed, compensating", { error: String(trackError) });

        await ctx.runMutation(internal.projectShare._revokeProjectShare, {
          shareId: sId,
        });
        await ctx.runMutation(internal.projectShare._trackShareUsageCount, {
          projectId: project._id,
          value: -1,
        });

        let billingPortalUrl: string | null = null;
        try {
          const portalResult = await ctx.autumn.customers.billingPortal(ctx, {});
          billingPortalUrl = portalResult.data?.url || null;
        } catch (portalError) {
          log.error("Failed to get billing portal URL", { error: String(portalError) });
        }

        return {
          success: false,
          paymentFailed: true,
          billingPortalUrl,
          message: "Payment failed. Please update your billing settings.",
        };
      }
    }

    await ctx.runMutation(internal.actionLog._insertActionLog, {
      projectId: args.projectId,
      projectName: project.name,
      userId: ctx.userId,
      action: "share.added",
      metadata: {
        sharedUserId: targetUser._id,
        sharedUserEmail: targetUser.email,
      },
    });

    const owner = await ctx.runQuery(components.betterAuth.user.loadUserById, {
      userId: project.ownerId as BetterAuthId<"user">,
    });

    try {
      await sendEmail(ctx, targetUser._id, targetUser.email, {
        kind: EmailKind.CollaboratorAdded,
        userName: targetUser.name || "there",
        projectName: project.name,
        ownerName: owner?.name || "someone",
      });
    } catch (error) {
      log.error("Failed to send collaborator added email", { error: String(error) });
    }

    log.info("Project shared", {
      projectId: args.projectId,
      sharedBy: ctx.userId,
      targetUser: targetUser._id,
      isPaidShare,
    });

    return { success: true, shareId: sId };
  },
});

export const revokeShare = protectedAction({
  args: {
    shareId: v.id("projectShare"),
  },
  handler: async (ctx: ProtectedActionCtx, args: { shareId: Id<"projectShare"> }) => {
    await checkRateLimit(ctx, "write");

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

    await ctx.runMutation(internal.projectShare._revokeProjectShare, {
      shareId: args.shareId,
    });

    const revokedUser = (await ctx.runQuery(components.betterAuth.user.loadUserById, {
      userId: share.userId as BetterAuthId<"user">,
    })) as BetterAuthDoc<"user"> | null;

    await ctx.runMutation(internal.actionLog._insertActionLog, {
      projectId: share.projectId,
      projectName: project.name,
      userId: ctx.userId,
      action: "share.revoked",
      metadata: {
        sharedUserId: share.userId,
        sharedUserEmail: revokedUser?.email,
        keyRotated: false,
      },
    });

    // Decrement usage count first
    await ctx.runMutation(internal.projectShare._trackShareUsageCount, {
      projectId: share.projectId,
      value: -1,
    });

    // Then check if we were using purchased shares (after decrement)
    const updatedProject = await ctx.runQuery(internal.project._loadProjectById, {
      projectId: share.projectId,
    });
    const newUsage = updatedProject.shareUsageCount ?? 0;

    // Only track -1 if we were using more than free limit (meaning we freed up a purchased share)
    // After decrement, if newUsage >= freeShareLimit, we were using purchased shares
    if (newUsage >= shareLimits.freeShareLimit) {
      try {
        await ctx.autumn.track(ctx, {
          featureId: "additional_shares",
          value: -1,
        });
      } catch (error: unknown) {
        log.error("Failed to track usage decrease in Autumn", { error: String(error) });

        await ctx.scheduler.runAfter(5 * 60 * 1000, internal.autumn._retryAutumnTracking, {
          identity: {
            customerId: ctx.userId,
            customerData: {
              name: ctx.name,
              email: ctx.email,
            },
          },
          attemptCount: 1,
          featureId: "additional_shares",
          projectId: project._id,
          value: -1,
        });
      }
    }

    log.info("Share revoked", {
      shareId: args.shareId,
      projectId: share.projectId,
      userId: ctx.userId,
    });

    return { success: true };
  },
});

export const revokeShareWithRotation = protectedAction({
  args: {
    shareId: v.id("projectShare"),
    newEncryptedProjectKey: v.string(),
    rewrappedShares: v.array(
      v.object({
        shareId: v.id("projectShare"),
        newEncryptedProjectKey: v.string(),
      }),
    ),
    reEncryptedSecrets: v.array(
      v.object({
        secretId: v.id("secret"),
        newEncryptedValue: v.string(),
      }),
    ),
  },
  handler: async (
    ctx: ProtectedActionCtx,
    args: {
      shareId: Id<"projectShare">;
      newEncryptedProjectKey: string;
      rewrappedShares: Array<{ shareId: Id<"projectShare">; newEncryptedProjectKey: string }>;
      reEncryptedSecrets: Array<{ secretId: Id<"secret">; newEncryptedValue: string }>;
    },
  ) => {
    const share: Doc<"projectShare"> = await ctx.runQuery(internal.projectShare._loadShareById, {
      shareId: args.shareId,
    });

    const project: Doc<"project"> = await ctx.runQuery(internal.project._loadProjectById, {
      projectId: share.projectId,
    });

    const newKeyVersion = project.keyVersion + 1;

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

    if (args.reEncryptedSecrets.length > 0) {
      const secretValidation = await ctx.runQuery(internal.secret._validateSecretsForRotation, {
        secretIds: args.reEncryptedSecrets.map(
          (s: { secretId: Id<"secret">; newEncryptedValue: string }) => s.secretId,
        ),
        projectId: share.projectId,
      });

      if (!secretValidation.valid) {
        if (secretValidation.missingSecretIds.length > 0) {
          throw createError({
            code: ErrorCode.SECRET_NOT_FOUND,
            message: `Cannot rotate: ${secretValidation.missingSecretIds.length} secret(s) not found`,
            severity: ErrorSeverity.High,
            metadata: { missingSecretIds: secretValidation.missingSecretIds },
          });
        }

        if (secretValidation.wrongProjectSecretIds.length > 0) {
          throw createError({
            code: ErrorCode.INVALID_OPERATION,
            message: `Cannot rotate: ${secretValidation.wrongProjectSecretIds.length} secret(s) belong to different project`,
            severity: ErrorSeverity.High,
            metadata: { wrongProjectSecretIds: secretValidation.wrongProjectSecretIds },
          });
        }
      }
    }

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
    }

    await checkRateLimit(ctx, "write");

    await ctx.runMutation(internal.projectShare._revokeProjectShare, {
      shareId: args.shareId,
    });

    await ctx.runMutation(internal.projectShare._trackShareUsageCount, {
      projectId: share.projectId,
      value: -1,
    });

    const projectAfterDecrement = await ctx.runQuery(internal.project._loadProjectById, {
      projectId: share.projectId,
    });
    const newUsage = projectAfterDecrement.shareUsageCount ?? 0;

    if (newUsage >= shareLimits.freeShareLimit) {
      try {
        await ctx.autumn.track(ctx, {
          featureId: "additional_shares",
          value: -1,
        });
      } catch (error: unknown) {
        log.error("Failed to track usage decrease in Autumn", { error: String(error) });

        await ctx.scheduler.runAfter(5 * 60 * 1000, internal.autumn._retryAutumnTracking, {
          identity: {
            customerId: ctx.userId,
            customerData: {
              name: ctx.name,
              email: ctx.email,
            },
          },
          attemptCount: 1,
          featureId: "additional_shares",
          projectId: project._id,
          value: -1,
        });
      }
    }

    const oldKeyVersion = project.keyVersion;
    await ctx.runMutation(internal.project._rotateProjectKey, {
      projectId: share.projectId,
      newEncryptedProjectKey: args.newEncryptedProjectKey,
      newKeyVersion,
    });

    for (const rewrapped of args.rewrappedShares) {
      await ctx.runMutation(internal.projectShare._updateShareKey, {
        shareId: rewrapped.shareId,
        newEncryptedProjectKey: rewrapped.newEncryptedProjectKey,
      });
    }

    let secretsReEncrypted = 0;

    if (args.reEncryptedSecrets.length > 0) {
      const { totalEncrypted } = await ctx.runMutation(
        internal.secret._reEncryptSecretsForKeyRotation,
        {
          secrets: args.reEncryptedSecrets.map(
            (s: { secretId: Id<"secret">; newEncryptedValue: string }) => ({
              secretId: s.secretId,
              newEncryptedValue: s.newEncryptedValue,
              newEncryptionKeyVersion: newKeyVersion,
            }),
          ),
          userId: ctx.userId,
        },
      );
      secretsReEncrypted = totalEncrypted;
    }

    await ctx.runMutation(internal.environment._invalidateProjectCache, {
      projectId: share.projectId,
    });

    await ctx.runMutation(internal.projectShare._insertKeyRotation, {
      projectId: share.projectId,
      oldKeyVersion,
      newKeyVersion,
      rotatedBy: ctx.userId,
      reason: "share_revoked",
      secretsReEncrypted,
      sharesUpdated: args.rewrappedShares.length,
    });

    const revokedUser = (await ctx.runQuery(components.betterAuth.user.loadUserById, {
      userId: share.userId as BetterAuthId<"user">,
    })) as BetterAuthDoc<"user"> | null;

    await ctx.runMutation(internal.actionLog._insertActionLog, {
      projectId: share.projectId,
      projectName: project.name,
      userId: ctx.userId,
      action: "share.revoked",
      metadata: {
        sharedUserId: share.userId,
        sharedUserEmail: revokedUser?.email,
        keyRotated: true,
        oldKeyVersion,
        newKeyVersion,
        secretsReEncrypted,
        sharesUpdated: args.rewrappedShares.length,
      },
    });

    log.info("Share revoked with key rotation", {
      shareId: args.shareId,
      projectId: share.projectId,
      userId: ctx.userId,
      secretsReEncrypted,
      sharesRewrapped: args.rewrappedShares.length,
    });

    return { success: true };
  },
});

export const listActiveProjectSharesByProject = protectedQuery({
  args: {
    projectId: v.id("project"),
  },
  handler: async (ctx: ProtectedQueryCtx, args: { projectId: Id<"project"> }) => {
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
          userPublicKey: user?.publicKey || null,
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

export const listActiveSharedProjectsForCurrentUser = protectedQuery({
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

        const { accessible } = await isProjectAccessible(ctx, project);

        const owner = (await ctx.runQuery(components.betterAuth.user.loadUserById, {
          userId: project.ownerId as BetterAuthId<"user">,
        })) as BetterAuthDoc<"user"> | null;

        let status: "shared" | "archived" | "restricted";
        if (project.isArchived) {
          status = "archived";
        } else if (!accessible) {
          status = "restricted";
        } else {
          status = "shared";
        }

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
          isRestricted: !accessible,
          isArchived: project.isArchived,
          status,
        };
      }),
    );

    return { shares: sharesWithProjects };
  },
});

export const getProjectShareByProjectForCurrentUser = protectedQuery({
  args: {
    projectId: v.id("project"),
  },
  handler: async (
    ctx: ProtectedQueryCtx,
    args: { projectId: Id<"project"> },
  ): Promise<{
    id: Id<"projectShare">;
    projectId: Id<"project">;
    encryptedProjectKey: string;
    sharedAt: number;
  }> => {
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

    const project = await ctx.runQuery(internal.project._loadProjectById, {
      projectId: args.projectId,
    });

    const { accessible } = await isProjectAccessible(ctx, project);

    if (!accessible) {
      throw createError({
        code: ErrorCode.PROJECT_INACCESSIBLE,
        message: "This project is not accessible",
        severity: ErrorSeverity.High,
      });
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
    userId: v.string(),
  },
  returns: v.array(doc(schema, "projectShare")),
  handler: async (ctx, args) => {
    const shares = await ctx.db
      .query("projectShare")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .filter((q) => q.eq(q.field("revokedAt"), undefined))
      .collect();

    return shares;
  },
});

export const _loadActiveShareByProjectAndUser = internalQuery({
  args: {
    projectId: v.id("project"),
    userId: v.string(),
  },
  returns: v.union(doc(schema, "projectShare"), v.null()),
  handler: async (ctx, args) => {
    const shares = await ctx.db
      .query("projectShare")
      .withIndex("by_project_user", (q) =>
        q.eq("projectId", args.projectId).eq("userId", args.userId),
      )
      .filter((q) => q.eq(q.field("revokedAt"), undefined))
      .collect();

    return shares[0] || null;
  },
});

export const _insertProjectShare = internalMutation({
  args: {
    projectId: v.id("project"),
    userId: v.string(),
    encryptedProjectKey: v.string(),
    sharedBy: v.string(),
  },
  returns: v.object({ success: v.boolean(), shareId: v.id("projectShare") }),
  handler: async (ctx, args) => {
    const now = Date.now();

    const shareId = await ctx.db.insert("projectShare", {
      projectId: args.projectId,
      userId: args.userId,
      encryptedProjectKey: args.encryptedProjectKey,
      sharedBy: args.sharedBy,
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

export const _trackShareUsageCount = internalMutation({
  args: { projectId: v.id("project"), value: v.number() },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);

    if (!project) {
      return { success: false };
    }

    const currentCount = project.shareUsageCount ?? 0;

    const newCount = currentCount + args.value;

    await ctx.db.patch(args.projectId, {
      shareUsageCount: newCount,
    });

    return { success: true };
  },
});
