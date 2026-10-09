import { paginationOptsValidator } from "convex/server";
import { type Infer, v } from "convex/values";
import { components, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import type { Id as BetterAuthId } from "./betterAuth/_generated/dataModel";
import { assertProjectAccess } from "./lib/access";
import { alreadyExistsError, createError, ErrorCode, notFoundError } from "./lib/errors";
import { protectedMutation, protectedQuery } from "./lib/middleware";
import { checkRateLimit } from "./lib/rateLimit";
import {
  ErrorSeverity,
  type ProtectedMutationCtx,
  type ProtectedQueryCtx,
  type SecretValueType,
} from "./lib/types";
import { MAX_SECRETS_PER_ENVIRONMENT } from "./secret";

export const historyRetention = {
  free: 10,
  pro: 50,
};

const changeTypeValidator = v.union(
  v.literal("updated"),
  v.literal("deleted"),
  v.literal("restored"),
);
const scopeValidator = v.union(v.literal("client"), v.literal("server"), v.literal("shared"));
const valueTypeValidator = v.union(v.literal("string"), v.literal("number"), v.literal("boolean"));

const historyVersionValidator = v.object({
  id: v.id("secretHistory"),
  version: v.number(),
  key: v.string(),
  encryptedValue: v.string(),
  valueType: valueTypeValidator,
  scope: scopeValidator,
  encryptionKeyVersion: v.number(),
  changeType: changeTypeValidator,
  changedBy: v.string(),
  changedByEmail: v.union(v.string(), v.null()),
  changedAt: v.number(),
});

const secretHistoryResultValidator = v.object({
  secret: v.object({
    id: v.id("secret"),
    projectId: v.id("project"),
    environmentId: v.id("environment"),
    folderId: v.optional(v.id("folder")),
    key: v.string(),
    isDeleted: v.boolean(),
    currentVersion: v.union(v.number(), v.null()),
    encryptedValue: v.union(v.string(), v.null()),
    valueType: valueTypeValidator,
    scope: scopeValidator,
    encryptionKeyVersion: v.number(),
    updatedBy: v.string(),
    updatedByEmail: v.union(v.string(), v.null()),
    updatedAt: v.number(),
  }),
  versions: v.array(historyVersionValidator),
  encryptedProjectKey: v.string(),
  retentionLimit: v.number(),
});

type SecretHistoryResult = Infer<typeof secretHistoryResultValidator>;

async function getRetentionLimit(
  ctx: Pick<MutationCtx, "runQuery">,
  project: Doc<"project">,
): Promise<number> {
  try {
    const owner = await ctx.runQuery(components.betterAuth.user.loadUserById, {
      userId: project.ownerId as BetterAuthId<"user">,
    });
    return owner.hasPro ? historyRetention.pro : historyRetention.free;
  } catch {
    return historyRetention.free;
  }
}

async function loadEmail(
  ctx: ProtectedQueryCtx,
  cache: Map<string, string | null>,
  userId: string,
): Promise<string | null> {
  const cached = cache.get(userId);
  if (cached !== undefined) return cached;

  let email: string | null = null;
  try {
    const user = await ctx.runQuery(components.betterAuth.user.loadUserById, {
      userId: userId as BetterAuthId<"user">,
    });
    email = user.email;
  } catch {
    email = null;
  }
  cache.set(userId, email);
  return email;
}

async function loadEncryptedProjectKeyForUser(
  ctx: ProtectedQueryCtx,
  project: Doc<"project">,
): Promise<string> {
  if (project.ownerId === ctx.userId) {
    return project.encryptedProjectKey;
  }

  const share = await ctx.runQuery(internal.projectShare._loadActiveShareByProjectAndUser, {
    projectId: project._id,
    userId: ctx.userId,
  });

  if (!share) {
    throw notFoundError("share");
  }

  return share.encryptedProjectKey;
}

async function buildHistoryResult(
  ctx: ProtectedQueryCtx,
  project: Doc<"project">,
  secret: Doc<"secret">,
): Promise<SecretHistoryResult> {
  const entries = await ctx.db
    .query("secretHistory")
    .withIndex("by_secret_version", (q) => q.eq("secretId", secret._id))
    .order("desc")
    .collect();

  const emails = new Map<string, string | null>();
  const latestVersion = entries[0]?.version ?? 0;

  const versions = [];
  for (const entry of entries) {
    versions.push({
      id: entry._id,
      version: entry.version,
      key: entry.key,
      encryptedValue: entry.encryptedValue,
      valueType: entry.valueType,
      scope: entry.scope,
      encryptionKeyVersion: entry.encryptionKeyVersion,
      changeType: entry.changeType,
      changedBy: entry.changedBy,
      changedByEmail: await loadEmail(ctx, emails, entry.changedBy),
      changedAt: entry.changedAt,
    });
  }

  return {
    secret: {
      id: secret._id,
      projectId: secret.projectId,
      environmentId: secret.environmentId,
      folderId: secret.folderId,
      key: secret.key,
      isDeleted: secret.isDeleted,
      currentVersion: secret.isDeleted ? null : latestVersion + 1,
      encryptedValue: secret.isDeleted ? null : secret.encryptedValue,
      valueType: secret.valueType,
      scope: secret.scope,
      encryptionKeyVersion: secret.encryptionKeyVersion,
      updatedBy: secret.updatedBy,
      updatedByEmail: await loadEmail(ctx, emails, secret.updatedBy),
      updatedAt: secret.updatedAt,
    },
    versions,
    encryptedProjectKey: await loadEncryptedProjectKeyForUser(ctx, project),
    retentionLimit: await getRetentionLimit(ctx, project),
  };
}

export const getSecretHistory = protectedQuery({
  args: {
    secretId: v.id("secret"),
  },
  returns: secretHistoryResultValidator,
  handler: async (
    ctx: ProtectedQueryCtx,
    args: { secretId: Id<"secret"> },
  ): Promise<SecretHistoryResult> => {
    const secret = await ctx.db.get(args.secretId);

    if (!secret) {
      throw notFoundError("secret");
    }

    const project = await ctx.runQuery(internal.project._loadProjectById, {
      projectId: secret.projectId,
    });

    await assertProjectAccess(ctx, project);

    return await buildHistoryResult(ctx, project, secret);
  },
});

export const getSecretHistoryByKey = protectedQuery({
  args: {
    projectId: v.id("project"),
    environmentName: v.string(),
    folderName: v.optional(v.string()),
    key: v.string(),
  },
  returns: secretHistoryResultValidator,
  handler: async (
    ctx: ProtectedQueryCtx,
    args: {
      projectId: Id<"project">;
      environmentName: string;
      folderName?: string;
      key: string;
    },
  ): Promise<SecretHistoryResult> => {
    const project = await ctx.runQuery(internal.project._loadProjectById, {
      projectId: args.projectId,
    });

    await assertProjectAccess(ctx, project);

    const { environmentId, folderId } = await ctx.runQuery(
      internal.secret._loadSecretLocationIdsPair,
      {
        projectId: args.projectId,
        environmentName: args.environmentName,
        folderName: args.folderName,
      },
    );

    const candidates = await ctx.db
      .query("secret")
      .withIndex("by_env_and_key", (q) => q.eq("environmentId", environmentId).eq("key", args.key))
      .filter((q) => q.eq(q.field("folderId"), folderId ?? undefined))
      .collect();

    const secret =
      candidates.find((candidate) => !candidate.isDeleted) ??
      candidates.sort((a, b) => b.updatedAt - a.updatedAt)[0];

    if (!secret) {
      throw notFoundError("secret");
    }

    return await buildHistoryResult(ctx, project, secret);
  },
});

export const restoreSecretVersion = protectedMutation({
  args: {
    secretId: v.id("secret"),
    version: v.number(),
  },
  returns: v.object({
    success: v.boolean(),
    restoredVersion: v.number(),
    wasDeleted: v.boolean(),
  }),
  handler: async (ctx: ProtectedMutationCtx, args: { secretId: Id<"secret">; version: number }) => {
    const secret = await ctx.db.get(args.secretId);

    if (!secret) {
      throw notFoundError("secret");
    }

    const project = await ctx.runQuery(internal.project._loadProjectById, {
      projectId: secret.projectId,
    });

    await assertProjectAccess(ctx, project);

    await checkRateLimit(ctx, "write");

    const target = await ctx.db
      .query("secretHistory")
      .withIndex("by_secret_version", (q) =>
        q.eq("secretId", args.secretId).eq("version", args.version),
      )
      .first();

    if (!target) {
      throw createError({
        code: ErrorCode.SECRET_NOT_FOUND,
        message: `Version ${args.version} of this secret was not found`,
        severity: ErrorSeverity.Low,
      });
    }

    if (target.encryptionKeyVersion !== project.keyVersion) {
      throw createError({
        code: ErrorCode.INVALID_RESOURCE_STATE,
        message: "This version was encrypted with a retired project key and cannot be restored",
        severity: ErrorSeverity.Medium,
      });
    }

    const environment = await ctx.runQuery(internal.environment._loadEnvironmentById, {
      environmentId: secret.environmentId,
    });

    let folder: Doc<"folder"> | undefined;
    if (secret.folderId) {
      folder = await ctx.runQuery(internal.folder._loadFolderById, {
        folderId: secret.folderId,
      });
    }

    const wasDeleted = secret.isDeleted;

    if (wasDeleted) {
      const conflicting = await ctx.runQuery(
        internal.secret._loadSecretByKeyAndEnvironmentIdAndFolderId,
        {
          environmentId: secret.environmentId,
          folderId: secret.folderId,
          key: secret.key,
        },
      );

      if (conflicting) {
        throw alreadyExistsError("secret", ErrorSeverity.Medium);
      }

      const activeSecrets = await ctx.runQuery(internal.secret._loadSecretsByEnvironmentId, {
        environmentId: secret.environmentId,
      });

      if (activeSecrets.length >= MAX_SECRETS_PER_ENVIRONMENT) {
        throw createError({
          code: ErrorCode.ENVIRONMENT_LIMIT_REACHED,
          message: `Cannot restore "${secret.key}". Maximum ${MAX_SECRETS_PER_ENVIRONMENT} secrets per environment.`,
          severity: ErrorSeverity.High,
        });
      }
    } else {
      await ctx.runMutation(internal.secretHistory._recordSecretVersion, {
        secretId: secret._id,
        changeType: "restored",
        changedBy: ctx.userId,
      });
    }

    await ctx.runMutation(internal.secret._updateSecret, {
      secretId: secret._id,
      updates: {
        updatedBy: ctx.userId,
        encryptedValue: target.encryptedValue,
        encryptionKeyVersion: target.encryptionKeyVersion,
        valueType: target.valueType as SecretValueType,
        scope: target.scope,
        isDeleted: false,
      },
    });

    await ctx.runMutation(internal.actionLog._insertActionLog, {
      projectId: project._id,
      projectName: project.name,
      userId: ctx.userId,
      action: "secret.restored",
      environmentId: environment._id,
      environmentName: environment.name,
      metadata: {
        secretId: secret._id,
        key: secret.key,
        folderId: secret.folderId,
        folderName: folder?.name,
        restoredVersion: args.version,
        wasDeleted,
      },
    });

    return { success: true, restoredVersion: args.version, wasDeleted };
  },
});

export const getSecretHistoryForRotation = protectedQuery({
  args: {
    projectId: v.id("project"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (
    ctx: ProtectedQueryCtx,
    args: {
      projectId: Id<"project">;
      paginationOpts: { numItems: number; cursor: string | null };
    },
  ) => {
    const project = await ctx.runQuery(internal.project._loadProjectById, {
      projectId: args.projectId,
    });

    await assertProjectAccess(ctx, project);

    if (project.ownerId !== ctx.userId) {
      throw createError({
        code: ErrorCode.INSUFFICIENT_PERMISSION,
        message: "Only the project owner can rotate project keys",
        severity: ErrorSeverity.High,
      });
    }

    const result = await ctx.db
      .query("secretHistory")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .paginate(args.paginationOpts);

    return {
      page: result.page.map((entry) => ({
        id: entry._id,
        encryptedValue: entry.encryptedValue,
        encryptionKeyVersion: entry.encryptionKeyVersion,
      })),
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});

export const _recordSecretVersion = internalMutation({
  args: {
    secretId: v.id("secret"),
    changeType: changeTypeValidator,
    changedBy: v.string(),
  },
  returns: v.object({ version: v.number(), pruned: v.number() }),
  handler: async (ctx, args) => {
    const secret = await ctx.db.get(args.secretId);

    if (!secret) {
      throw notFoundError("secret");
    }

    const project = await ctx.db.get(secret.projectId);

    if (!project) {
      throw notFoundError("project");
    }

    const latest = await ctx.db
      .query("secretHistory")
      .withIndex("by_secret_version", (q) => q.eq("secretId", secret._id))
      .order("desc")
      .first();

    const version = (latest?.version ?? 0) + 1;

    await ctx.db.insert("secretHistory", {
      secretId: secret._id,
      projectId: secret.projectId,
      environmentId: secret.environmentId,
      folderId: secret.folderId,
      key: secret.key,
      version,
      encryptedValue: secret.encryptedValue,
      valueType: secret.valueType,
      scope: secret.scope,
      encryptionKeyVersion: secret.encryptionKeyVersion,
      changeType: args.changeType,
      changedBy: args.changedBy,
      changedAt: Date.now(),
    });

    const retentionLimit = await getRetentionLimit(ctx, project);
    const entries = await ctx.db
      .query("secretHistory")
      .withIndex("by_secret_version", (q) => q.eq("secretId", secret._id))
      .order("desc")
      .collect();

    let pruned = 0;
    for (const stale of entries.slice(retentionLimit)) {
      await ctx.db.delete(stale._id);
      pruned++;
    }

    return { version, pruned };
  },
});

export interface ReEncryptedHistoryEntry {
  historyId: Id<"secretHistory">;
  newEncryptedValue: string;
}

/**
 * Re-encrypts history under a rotated project key, then deletes every entry still on an older
 * key (older clients, entries written while the client was re-encrypting) and blanks leftover
 * ciphertext on deleted secrets, so nothing readable with the revoked key survives the rotation.
 */
export async function rotateProjectHistory(
  ctx: MutationCtx,
  projectId: Id<"project">,
  entries: ReEncryptedHistoryEntry[],
  newKeyVersion: number,
): Promise<{ historyReEncrypted: number; historyPurged: number }> {
  let historyReEncrypted = 0;
  for (const { historyId, newEncryptedValue } of entries) {
    const entry = await ctx.db.get(historyId);
    if (!entry) continue;
    if (entry.projectId !== projectId) {
      createError({
        code: ErrorCode.INVALID_OPERATION,
        message: "Cannot rotate: history entries belong to a different project",
        severity: ErrorSeverity.High,
        metadata: { historyId },
      });
    }
    await ctx.db.patch(historyId, {
      encryptedValue: newEncryptedValue,
      encryptionKeyVersion: newKeyVersion,
    });
    historyReEncrypted++;
  }

  const stale = await ctx.db
    .query("secretHistory")
    .withIndex("by_project_key_version", (q) =>
      q.eq("projectId", projectId).lt("encryptionKeyVersion", newKeyVersion),
    )
    .collect();
  for (const entry of stale) {
    await ctx.db.delete(entry._id);
  }

  const deletedSecrets = await ctx.db
    .query("secret")
    .withIndex("by_project_deleted", (q) => q.eq("projectId", projectId).eq("isDeleted", true))
    .collect();
  for (const secret of deletedSecrets) {
    if (secret.encryptedValue !== "") {
      await ctx.db.patch(secret._id, { encryptedValue: "" });
    }
  }

  return { historyReEncrypted, historyPurged: stale.length };
}

export const _deleteHistoryForEnvironment = internalMutation({
  args: {
    environmentId: v.id("environment"),
  },
  returns: v.object({ deleted: v.number() }),
  handler: async (ctx, args) => {
    const entries = await ctx.db
      .query("secretHistory")
      .withIndex("by_environment", (q) => q.eq("environmentId", args.environmentId))
      .collect();

    for (const entry of entries) {
      await ctx.db.delete(entry._id);
    }

    return { deleted: entries.length };
  },
});

export const _deleteHistoryForFolder = internalMutation({
  args: {
    folderId: v.id("folder"),
  },
  returns: v.object({ deleted: v.number() }),
  handler: async (ctx, args) => {
    const entries = await ctx.db
      .query("secretHistory")
      .withIndex("by_folder", (q) => q.eq("folderId", args.folderId))
      .collect();

    for (const entry of entries) {
      await ctx.db.delete(entry._id);
    }

    return { deleted: entries.length };
  },
});
