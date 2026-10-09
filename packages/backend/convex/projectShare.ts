import { v } from "convex/values";
import { doc } from "convex-helpers/validators";
import { components, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, internalQuery } from "./_generated/server";
import { requestUsageSync } from "./billing";
import { invalidateProjectCache } from "./environment";
import {
  assertProjectAccess,
  assertProjectOwner,
  isProjectAccessible,
  isUnlockedByOwnerPlan,
} from "./lib/access";
import {
  findActiveShare,
  findUser,
  getProjectOrThrow,
  insertActionLog,
  listActiveSharesByProject,
  listActiveSharesByUser,
  loadUser,
  type User,
} from "./lib/data";
import { alreadyExistsError, createError, ErrorCode, notFoundError } from "./lib/errors";
import { createLogger } from "./lib/logger";
import { inferValueChangedAt } from "./lib/rotation";
import { loadKeyRotationTimestamps } from "./lib/rotationData";
import { protectedAction, protectedQuery } from "./lib/middleware";
import { ADD_ON_PRICES_USD, getPlanState, PLANS, paidSharesFor } from "./lib/plans";
import { checkRateLimit } from "./lib/rateLimit";
import { EmailKind, ErrorSeverity } from "./lib/types";
import { createCheckoutUrlSafely } from "./project";
import schema from "./schema";
import { rotateProjectHistory } from "./secretHistory";

const log = createLogger("projectShare");

const EMAIL_PATTERN =
  /^[a-zA-Z0-9](?:[a-zA-Z0-9._+-]*[a-zA-Z0-9])?@[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z]{2,})+$/;

function userCache(ctx: Pick<QueryCtx, "runQuery">) {
  const cache = new Map<string, Promise<User | null>>();
  return (userId: string) => {
    let pending = cache.get(userId);
    if (!pending) {
      pending = findUser(ctx, userId);
      cache.set(userId, pending);
    }
    return pending;
  };
}

async function loadShareOrThrow(ctx: Pick<QueryCtx, "db">, shareId: Id<"projectShare">) {
  const share = await ctx.db.get(shareId);
  if (!share) notFoundError("share");
  return share;
}

function assertNotRevoked(share: Doc<"projectShare">) {
  if (share.revokedAt !== undefined) {
    createError({
      code: ErrorCode.INVALID_OPERATION,
      message: "Share is already revoked",
      severity: ErrorSeverity.Medium,
    });
  }
}

async function revokeAndCount(ctx: MutationCtx, share: Doc<"projectShare">) {
  const now = Date.now();
  await ctx.db.patch(share._id, { revokedAt: now, updatedAt: now });
  const remaining = (await listActiveSharesByProject(ctx, share.projectId)).length;
  await ctx.db.patch(share.projectId, { shareUsageCount: remaining });
  return remaining;
}

export const _getShareLimits = internalQuery({
  args: { userId: v.string(), projectId: v.id("project") },
  handler: async (ctx, { userId, projectId }) => {
    const project = await getProjectOrThrow(ctx, projectId);
    await assertProjectAccess({ ...ctx, userId }, project);

    const owner = await loadUser(ctx, project.ownerId);
    const { isPro } = getPlanState(owner);
    const totalSharesCount = (await listActiveSharesByProject(ctx, projectId)).length;
    const included = PLANS.pro.includedSharesPerProject;

    return {
      hasPro: isPro,
      freeShareLimit: included,
      purchasedSharesCount: isPro ? paidSharesFor(totalSharesCount) : 0,
      totalSharesCount,
      unusedShares: isPro ? Math.max(0, included - totalSharesCount) : 0,
    };
  },
});

export const getShareLimits = protectedAction({
  args: { projectId: v.id("project") },
  handler: async (
    ctx,
    { projectId },
  ): Promise<{
    hasPro: boolean;
    freeShareLimit: number;
    purchasedSharesCount: number;
    totalSharesCount: number;
    unusedShares: number;
  }> => {
    return await ctx.runQuery(internal.projectShare._getShareLimits, {
      userId: ctx.userId,
      projectId,
    });
  },
});

type ShareGateResult =
  | { success: true; shareId: Id<"projectShare"> }
  | { success: false; requiresProPlan: true; message: string }
  | { success: false; requiresConfirmation: true; freeLimit: number; message: string };

type ShareProjectResult =
  | Exclude<ShareGateResult, { requiresProPlan: true }>
  | { success: false; requiresProPlan: true; message: string; checkoutUrl: string | null };

export const _shareProject = internalMutation({
  args: {
    userId: v.string(),
    projectId: v.id("project"),
    userEmail: v.string(),
    encryptedProjectKey: v.string(),
    confirmPayment: v.boolean(),
  },
  handler: async (ctx, args): Promise<ShareGateResult> => {
    const actor = { ...ctx, userId: args.userId };
    const project = await getProjectOrThrow(ctx, args.projectId);
    await assertProjectAccess(actor, project);
    assertProjectOwner(actor, project, "share this project");

    // Free users get the upgrade prompt before any payload validation, so clients can probe with an empty key.
    const owner = await loadUser(ctx, args.userId);
    const { limits } = getPlanState(owner);
    if (!limits.canShare) {
      return {
        success: false as const,
        requiresProPlan: true as const,
        message: "Pro plan required to share projects",
      };
    }

    const email = args.userEmail.trim();
    if (!EMAIL_PATTERN.test(email)) {
      createError({
        code: ErrorCode.INVALID_OPERATION,
        message: "Invalid email address format",
        severity: ErrorSeverity.Medium,
      });
    }

    if (!args.encryptedProjectKey.trim()) {
      createError({
        code: ErrorCode.INVALID_OPERATION,
        message: "Encrypted project key is required to share a project",
        severity: ErrorSeverity.High,
      });
    }

    const target: User | null = await ctx.runQuery(components.betterAuth.user.loadUserByEmail, {
      email,
    });

    // Same answer for unknown users and users without keys, so this can't be used to enumerate accounts.
    if (!target || !target.publicKey) {
      createError({
        code: ErrorCode.USER_NOT_FOUND,
        message: "No Relic user with encryption keys was found for this email",
        severity: ErrorSeverity.Medium,
      });
    }
    if (target._id === args.userId) {
      createError({
        code: ErrorCode.INVALID_OPERATION,
        message: "Cannot share project with yourself",
        severity: ErrorSeverity.Medium,
      });
    }
    if (await findActiveShare(ctx, project._id, target._id)) {
      alreadyExistsError("share", ErrorSeverity.Medium);
    }

    const activeCount = (await listActiveSharesByProject(ctx, project._id)).length;
    const isPaidShare = activeCount >= limits.includedSharesPerProject;

    if (isPaidShare && !args.confirmPayment) {
      return {
        success: false as const,
        requiresConfirmation: true as const,
        freeLimit: limits.includedSharesPerProject,
        message: `Adding a share costs $${ADD_ON_PRICES_USD.share}/month. Confirm to proceed.`,
      };
    }

    const now = Date.now();
    const shareId = await ctx.db.insert("projectShare", {
      projectId: project._id,
      userId: target._id,
      encryptedProjectKey: args.encryptedProjectKey,
      sharedBy: args.userId,
      sharedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(project._id, { shareUsageCount: activeCount + 1 });

    await insertActionLog(ctx, {
      projectId: project._id,
      projectName: project.name,
      userId: args.userId,
      action: "share.added",
      metadata: { sharedUserId: target._id, sharedUserEmail: target.email },
    });
    await requestUsageSync(ctx, args.userId);
    await ctx.scheduler.runAfter(0, internal.emails._send, {
      userId: target._id,
      to: target.email,
      data: {
        kind: EmailKind.CollaboratorAdded,
        userName: target.name || "there",
        projectName: project.name,
        ownerName: owner.name || "someone",
      },
    });

    log.info("Project shared", { projectId: project._id, targetUser: target._id, isPaidShare });
    return { success: true as const, shareId };
  },
});

export const shareProject = protectedAction({
  args: {
    projectId: v.id("project"),
    userEmail: v.string(),
    encryptedProjectKey: v.string(),
    confirmPayment: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<ShareProjectResult> => {
    await checkRateLimit(ctx, "write");

    const result: ShareGateResult = await ctx.runMutation(internal.projectShare._shareProject, {
      userId: ctx.userId,
      projectId: args.projectId,
      userEmail: args.userEmail,
      encryptedProjectKey: args.encryptedProjectKey,
      confirmPayment: args.confirmPayment ?? false,
    });

    if ("requiresProPlan" in result) {
      return { ...result, checkoutUrl: await createCheckoutUrlSafely(ctx) };
    }
    return result;
  },
});

export const _revokeShare = internalMutation({
  args: { userId: v.string(), shareId: v.id("projectShare") },
  handler: async (ctx, { userId, shareId }) => {
    const actor = { ...ctx, userId };
    const share = await loadShareOrThrow(ctx, shareId);
    const project = await getProjectOrThrow(ctx, share.projectId);
    await assertProjectAccess(actor, project);
    assertProjectOwner(actor, project, "revoke this share");
    assertNotRevoked(share);

    await revokeAndCount(ctx, share);

    const revokedUser = await findUser(ctx, share.userId);
    await insertActionLog(ctx, {
      projectId: share.projectId,
      projectName: project.name,
      userId,
      action: "share.revoked",
      metadata: {
        sharedUserId: share.userId,
        sharedUserEmail: revokedUser?.email,
        keyRotated: false,
      },
    });
    await requestUsageSync(ctx, userId);

    log.info("Share revoked", { shareId, projectId: share.projectId, userId });
    return { success: true };
  },
});

export const revokeShare = protectedAction({
  args: { shareId: v.id("projectShare") },
  handler: async (ctx, { shareId }): Promise<{ success: boolean }> => {
    await checkRateLimit(ctx, "write");
    return await ctx.runMutation(internal.projectShare._revokeShare, {
      userId: ctx.userId,
      shareId,
    });
  },
});

const rotationArgs = {
  shareId: v.id("projectShare"),
  newEncryptedProjectKey: v.string(),
  rewrappedShares: v.array(
    v.object({ shareId: v.id("projectShare"), newEncryptedProjectKey: v.string() }),
  ),
  reEncryptedSecrets: v.array(
    v.object({ secretId: v.id("secret"), newEncryptedValue: v.string() }),
  ),
  rewrappedServiceAccounts: v.optional(
    v.array(
      v.object({ serviceAccountId: v.id("serviceAccount"), newEncryptedProjectKey: v.string() }),
    ),
  ),
  reEncryptedHistory: v.optional(
    v.array(v.object({ historyId: v.id("secretHistory"), newEncryptedValue: v.string() })),
  ),
};

function assertCovers(expected: string[], provided: string[], what: string) {
  const providedSet = new Set(provided);
  const missing = expected.filter((id) => !providedSet.has(id));
  const extra = provided.filter((id) => !expected.includes(id));

  if (missing.length > 0 || extra.length > 0 || providedSet.size !== provided.length) {
    createError({
      code: ErrorCode.INVALID_OPERATION,
      message:
        missing.length > 0
          ? `Cannot rotate: ${missing.length} ${what} were not re-encrypted. Update Relic and try again.`
          : `Cannot rotate: invalid ${what} in request`,
      severity: ErrorSeverity.High,
      metadata: { missing, extra },
    });
  }
}

/** Revokes a share and rotates the project key in a single transaction, so no state is ever half-rotated. */
export const _revokeShareWithRotation = internalMutation({
  args: { userId: v.string(), ...rotationArgs },
  handler: async (ctx, args) => {
    const actor = { ...ctx, userId: args.userId };
    const share = await loadShareOrThrow(ctx, args.shareId);
    const project = await getProjectOrThrow(ctx, share.projectId);
    await assertProjectAccess(actor, project);
    assertProjectOwner(actor, project, "revoke this share");
    assertNotRevoked(share);

    const remainingShares = (await listActiveSharesByProject(ctx, project._id)).filter(
      (s) => s._id !== share._id,
    );
    const serviceAccounts = await ctx.db
      .query("serviceAccount")
      .withIndex("by_project_revoked", (q) =>
        q.eq("projectId", project._id).eq("revokedAt", undefined),
      )
      .collect();
    const secrets = await ctx.db
      .query("secret")
      .withIndex("by_project_deleted", (q) => q.eq("projectId", project._id).eq("isDeleted", false))
      .collect();

    const rewrappedServiceAccounts = args.rewrappedServiceAccounts ?? [];
    assertCovers(
      secrets.map((s) => s._id),
      args.reEncryptedSecrets.map((s) => s.secretId),
      "secret(s)",
    );
    assertCovers(
      remainingShares.map((s) => s._id),
      args.rewrappedShares.map((s) => s.shareId),
      "collaborator key(s)",
    );
    assertCovers(
      serviceAccounts.map((s) => s._id),
      rewrappedServiceAccounts.map((s) => s.serviceAccountId),
      "service account key(s)",
    );

    const now = Date.now();
    const oldKeyVersion = project.keyVersion;
    const newKeyVersion = oldKeyVersion + 1;
    const secretsById = new Map(secrets.map((s) => [s._id, s]));
    const keyRotationTimestamps = secrets.some((s) => s.valueChangedAt === undefined)
      ? await loadKeyRotationTimestamps(ctx, project._id)
      : [];

    await revokeAndCount(ctx, share);
    await ctx.db.patch(project._id, {
      encryptedProjectKey: args.newEncryptedProjectKey,
      keyVersion: newKeyVersion,
      updatedAt: now,
    });

    for (const { shareId, newEncryptedProjectKey } of args.rewrappedShares) {
      await ctx.db.patch(shareId, { encryptedProjectKey: newEncryptedProjectKey, updatedAt: now });
    }
    for (const { serviceAccountId, newEncryptedProjectKey } of rewrappedServiceAccounts) {
      await ctx.db.patch(serviceAccountId, {
        encryptedProjectKey: newEncryptedProjectKey,
        updatedAt: now,
      });
    }
    for (const { secretId, newEncryptedValue } of args.reEncryptedSecrets) {
      // Re-encryption keeps the plaintext, so pin the value age before updatedAt moves.
      const existing = secretsById.get(secretId);
      await ctx.db.patch(secretId, {
        encryptedValue: newEncryptedValue,
        encryptionKeyVersion: newKeyVersion,
        valueChangedAt:
          existing?.valueChangedAt ??
          (existing ? inferValueChangedAt(existing, keyRotationTimestamps) : undefined),
        updatedAt: now,
        updatedBy: args.userId,
      });
    }

    const { historyReEncrypted, historyPurged } = await rotateProjectHistory(
      ctx,
      project._id,
      args.reEncryptedHistory ?? [],
      newKeyVersion,
    );

    await invalidateProjectCache(ctx, project._id);

    await ctx.db.insert("keyRotation", {
      projectId: project._id,
      oldKeyVersion,
      newKeyVersion,
      rotatedBy: args.userId,
      reason: "share_revoked",
      secretsReEncrypted: args.reEncryptedSecrets.length,
      sharesUpdated: args.rewrappedShares.length,
      historyReEncrypted,
      historyPurged,
      createdAt: now,
    });

    const revokedUser = await findUser(ctx, share.userId);
    await insertActionLog(ctx, {
      projectId: project._id,
      projectName: project.name,
      userId: args.userId,
      action: "share.revoked",
      metadata: {
        sharedUserId: share.userId,
        sharedUserEmail: revokedUser?.email,
        keyRotated: true,
        oldKeyVersion,
        newKeyVersion,
        secretsReEncrypted: args.reEncryptedSecrets.length,
        sharesUpdated: args.rewrappedShares.length,
        historyReEncrypted,
        historyPurged,
      },
    });
    await requestUsageSync(ctx, args.userId);

    log.info("Share revoked with key rotation", {
      shareId: share._id,
      projectId: project._id,
      secretsReEncrypted: args.reEncryptedSecrets.length,
      sharesRewrapped: args.rewrappedShares.length,
      serviceAccountsRewrapped: rewrappedServiceAccounts.length,
      historyReEncrypted,
      historyPurged,
    });
    return { success: true };
  },
});

export const revokeShareWithRotation = protectedAction({
  args: rotationArgs,
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    await checkRateLimit(ctx, "write");
    return await ctx.runMutation(internal.projectShare._revokeShareWithRotation, {
      userId: ctx.userId,
      ...args,
    });
  },
});

export const listActiveProjectSharesByProject = protectedQuery({
  args: { projectId: v.id("project") },
  handler: async (ctx, args) => {
    const project = await getProjectOrThrow(ctx, args.projectId);
    await assertProjectAccess(ctx, project);
    assertProjectOwner(ctx, project, "list shares for this project");

    const getUser = userCache(ctx);
    const shares = await listActiveSharesByProject(ctx, args.projectId);

    return {
      shares: await Promise.all(
        shares.map(async (share) => {
          const [user, sharedBy] = await Promise.all([
            getUser(share.userId),
            getUser(share.sharedBy),
          ]);
          return {
            id: share._id,
            projectId: share.projectId,
            userId: share.userId,
            userEmail: user?.email || "Unknown",
            userName: user?.name || "Unknown",
            userPublicKey: user?.publicKey || null,
            sharedBy: share.sharedBy,
            sharedByEmail: sharedBy?.email || "Unknown",
            sharedAt: share.sharedAt,
            createdAt: share.createdAt,
          };
        }),
      ),
    };
  },
});

export const listActiveSharedProjectsForCurrentUser = protectedQuery({
  args: {},
  handler: async (ctx) => {
    const getUser = userCache(ctx);
    const shares = await listActiveSharesByUser(ctx, ctx.userId);

    const results = await Promise.all(
      shares.map(async (share) => {
        const project = await ctx.db.get(share.projectId);
        if (!project) return null;

        const [owner, unlocked] = await Promise.all([
          getUser(project.ownerId),
          project.isArchived ? Promise.resolve(false) : isUnlockedByOwnerPlan(ctx, project),
        ]);

        const isRestricted = !unlocked;
        return {
          id: share._id,
          projectId: share.projectId,
          projectName: project.name,
          projectSlug: project.slug,
          ownerId: project.ownerId,
          ownerEmail: owner?.email || "Unknown",
          ownerName: owner?.name || "Unknown",
          sharedAt: share.sharedAt,
          encryptedProjectKey:
            isRestricted || project.isArchived ? null : share.encryptedProjectKey,
          isRestricted,
          isArchived: project.isArchived,
          status: project.isArchived
            ? ("archived" as const)
            : isRestricted
              ? ("restricted" as const)
              : ("shared" as const),
        };
      }),
    );

    return { shares: results.filter((r) => r !== null) };
  },
});

export const getProjectShareByProjectForCurrentUser = protectedQuery({
  args: { projectId: v.id("project") },
  handler: async (ctx, args) => {
    const share = await findActiveShare(ctx, args.projectId, ctx.userId);
    if (!share) notFoundError("share");

    const project = await getProjectOrThrow(ctx, args.projectId);
    const { accessible } = await isProjectAccessible(ctx, project);
    if (!accessible) {
      createError({
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
  args: { shareId: v.id("projectShare") },
  returns: doc(schema, "projectShare"),
  handler: async (ctx, { shareId }) => loadShareOrThrow(ctx, shareId),
});

export const _loadActiveSharesByProject = internalQuery({
  args: { projectId: v.id("project") },
  returns: v.array(doc(schema, "projectShare")),
  handler: async (ctx, { projectId }) => listActiveSharesByProject(ctx, projectId),
});

export const _loadActiveSharesByUser = internalQuery({
  args: { userId: v.string() },
  returns: v.array(doc(schema, "projectShare")),
  handler: async (ctx, { userId }) => listActiveSharesByUser(ctx, userId),
});

export const _loadActiveShareByProjectAndUser = internalQuery({
  args: { projectId: v.id("project"), userId: v.string() },
  returns: v.union(doc(schema, "projectShare"), v.null()),
  handler: async (ctx, { projectId, userId }) => findActiveShare(ctx, projectId, userId),
});
