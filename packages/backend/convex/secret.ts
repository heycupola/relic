import { v } from "convex/values";
import { getProjectOrThrow } from "./lib/data";
import { doc } from "convex-helpers/validators";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type QueryCtx } from "./_generated/server";
import { assertProjectAccess } from "./lib/access";
import { alreadyExistsError, createError, ErrorCode, notFoundError } from "./lib/errors";
import { generateSlug } from "./lib/helpers";
import { protectedMutation, protectedQuery } from "./lib/middleware";
import { buildExportAudit, type PushAudit, pushAuditValidator } from "./lib/push";
import { checkRateLimit } from "./lib/rateLimit";
import {
  ErrorSeverity,
  type ProtectedMutationCtx,
  type ProtectedQueryCtx,
  SecretValueType,
} from "./lib/types";
import schema from "./schema";

type ExportSecretsResult = {
  secrets: {
    id: Id<"secret">;
    key: string;
    encryptedValue: string;
    scope: "client" | "server" | "shared";
    valueType: "string" | "number" | "boolean";
  }[];
  count: number;
  encryptedProjectKey: string;
  environmentId: Id<"environment">;
  folderId: Id<"folder"> | null;
};

type ServiceAccountExportResult = {
  secrets: {
    id: Id<"secret">;
    key: string;
    encryptedValue: string;
    scope: "client" | "server" | "shared";
    valueType: "string" | "number" | "boolean";
  }[];
  count: number;
  environmentId: Id<"environment">;
  folderId: Id<"folder"> | null;
};

const MAX_SECRETS_PER_ENVIRONMENT = 1024;

export const STALE_PROJECT_KEY_MESSAGE =
  "The project key changed. Reload the project and try again.";

/** Rejects writes encrypted with a project key the client loaded before a rotation. */
function assertExpectedKeyVersion(project: Doc<"project">, expectedKeyVersion?: number): void {
  if (expectedKeyVersion !== undefined && expectedKeyVersion !== project.keyVersion) {
    createError({
      code: ErrorCode.INVALID_RESOURCE_STATE,
      message: STALE_PROJECT_KEY_MESSAGE,
      severity: ErrorSeverity.Medium,
    });
  }
}

function assertFolderInEnvironment(folder: Doc<"folder">, environment: Doc<"environment">): void {
  if (folder.environmentId !== environment._id || folder.projectId !== environment.projectId) {
    createError({
      code: ErrorCode.INVALID_ARGUMENTS,
      message: "Folder does not belong to this environment",
      severity: ErrorSeverity.Medium,
    });
  }
}

async function countActiveSecretsInEnvironment(
  ctx: Pick<QueryCtx, "db">,
  environmentId: Id<"environment">,
): Promise<number> {
  const secrets = await ctx.db
    .query("secret")
    .withIndex("by_environment_deleted", (q) =>
      q.eq("environmentId", environmentId).eq("isDeleted", false),
    )
    .take(MAX_SECRETS_PER_ENVIRONMENT + 1);
  return secrets.length;
}

async function findActiveSecretByKey(
  ctx: Pick<QueryCtx, "db">,
  environmentId: Id<"environment">,
  folderId: Id<"folder"> | undefined,
  key: string,
): Promise<Doc<"secret"> | null> {
  return await ctx.db
    .query("secret")
    .withIndex("by_env_folder_key", (q) =>
      q
        .eq("environmentId", environmentId)
        .eq("folderId", folderId)
        .eq("key", key)
        .eq("isDeleted", false),
    )
    .first();
}

/** Throws when renaming `secret` to `newKey` would collide with another live secret in its folder. */
async function assertRenameAvailable(
  ctx: Pick<QueryCtx, "db">,
  secret: Doc<"secret">,
  newKey: string | undefined,
): Promise<void> {
  if (newKey === undefined || newKey === secret.key) return;
  const clash = await findActiveSecretByKey(ctx, secret.environmentId, secret.folderId, newKey);
  if (clash && clash._id !== secret._id) {
    alreadyExistsError("secret", ErrorSeverity.Medium);
  }
}

function environmentLimitError(currentCount: number, key: string): never {
  return createError({
    code: ErrorCode.ENVIRONMENT_LIMIT_REACHED,
    message: `Cannot create new secret "${key}". Environment already has ${currentCount} secrets. Maximum ${MAX_SECRETS_PER_ENVIRONMENT} secrets per environment.`,
    severity: ErrorSeverity.High,
  });
}

export const createSecret = protectedMutation({
  args: {
    environmentId: v.id("environment"),
    folderId: v.optional(v.id("folder")),
    key: v.string(),
    encryptedValue: v.string(),
    valueType: v.union(v.literal("string"), v.literal("number"), v.literal("boolean")),
    scope: v.optional(v.union(v.literal("client"), v.literal("server"), v.literal("shared"))),
    expectedKeyVersion: v.optional(v.number()),
    // description: v.optional(v.string()),
    // tags: v.optional(v.array(v.string())),
  },
  returns: v.object({ id: v.id("secret") }),
  handler: async (
    ctx: ProtectedMutationCtx,
    args: {
      environmentId: Id<"environment">;
      folderId?: Id<"folder">;
      key: string;
      encryptedValue: string;
      valueType: "string" | "number" | "boolean";
      scope?: "client" | "server" | "shared";
      expectedKeyVersion?: number;
    },
  ) => {
    const environmentResult = await ctx.runQuery(internal.environment._loadEnvironmentById, {
      environmentId: args.environmentId,
    });
    const environment = environmentResult as Doc<"environment">;

    const projectResult = await getProjectOrThrow(ctx, environment.projectId);
    const project = projectResult as Doc<"project">;

    await assertProjectAccess(ctx, project);

    await checkRateLimit(ctx, "write");

    assertExpectedKeyVersion(project, args.expectedKeyVersion);

    let folder: Doc<"folder"> | undefined;

    if (args.folderId) {
      // NOTE: loads and checks the folder's existence
      folder = await ctx.runQuery(internal.folder._loadFolderById, {
        folderId: args.folderId,
      });
      assertFolderInEnvironment(folder, environment);
    }

    // NOTE: loads the secret and checks the its existence to prevent duplications
    const secret = await ctx.runQuery(internal.secret._loadSecretByKeyAndEnvironmentIdAndFolderId, {
      environmentId: args.environmentId,
      folderId: args.folderId,
      key: args.key,
    });

    if (secret) {
      throw alreadyExistsError("secret", ErrorSeverity.Medium);
    }

    const existingCount = await countActiveSecretsInEnvironment(ctx, args.environmentId);
    if (existingCount >= MAX_SECRETS_PER_ENVIRONMENT) {
      environmentLimitError(existingCount, args.key);
    }

    // create secret using project's current key version
    const insertResult = await ctx.runMutation(internal.secret._insertSecret, {
      createdBy: ctx.userId,
      encryptedValue: args.encryptedValue,
      encryptionKeyVersion: project.keyVersion,
      environmentId: args.environmentId,
      key: args.key,
      valueType: args.valueType,
      scope: args.scope ? args.scope : "shared",
      projectId: project._id,
      folderId: args.folderId,
    });
    const { secretId } = insertResult as { secretId: Id<"secret"> };

    await ctx.runMutation(internal.actionLog._insertActionLog, {
      projectId: project._id,
      projectName: project.name,
      userId: ctx.userId,
      action: "secret.created",
      environmentId: environment._id,
      environmentName: environment.name,
      metadata: {
        secretId,
        key: args.key,
        folderId: args.folderId,
        folderName: folder?.name,
      },
    });

    return { id: secretId };
  },
});

export const getSecret = protectedQuery({
  args: {
    secretId: v.id("secret"),
  },
  handler: async (ctx: ProtectedQueryCtx, args: { secretId: Id<"secret"> }) => {
    const secret = await ctx.runQuery(internal.secret._loadSecretById, {
      secretId: args.secretId,
    });

    const secretInstance = secret as Doc<"secret"> | null;

    if (!secretInstance || secretInstance.isDeleted) {
      throw notFoundError("secret");
    }

    const project = await getProjectOrThrow(ctx, secretInstance.projectId);

    await assertProjectAccess(ctx, project);

    return {
      id: secretInstance._id,
      projectId: secretInstance.projectId,
      environmentId: secretInstance.environmentId,
      folderId: secretInstance.folderId,
      key: secretInstance.key,
      encryptedValue: secretInstance.encryptedValue,
      valueType: secretInstance.valueType,
      scope: secretInstance.scope,
      description: secretInstance.description,
      encryptionKeyVersion: secretInstance.encryptionKeyVersion,
      tags: secretInstance.tags,
      isDeleted: secretInstance.isDeleted,
      createdBy: secretInstance.createdBy,
      createdAt: secretInstance.createdAt,
      updatedBy: secretInstance.updatedBy,
      updatedAt: secretInstance.updatedAt,
    };
  },
});

export const getAllSecretsForProject = protectedQuery({
  args: {
    projectId: v.id("project"),
  },
  returns: v.array(
    v.object({
      id: v.id("secret"),
      environmentId: v.id("environment"),
      encryptedValue: v.string(),
    }),
  ),
  handler: async (
    ctx: ProtectedQueryCtx,
    args: { projectId: Id<"project"> },
  ): Promise<
    Array<{ id: Id<"secret">; environmentId: Id<"environment">; encryptedValue: string }>
  > => {
    const project = await getProjectOrThrow(ctx, args.projectId);

    await assertProjectAccess(ctx, project);

    const secrets = await ctx.runQuery(internal.secret._loadSecretsByProjectId, {
      projectId: args.projectId,
    });

    return secrets.map((secret: Doc<"secret">) => ({
      id: secret._id,
      environmentId: secret.environmentId,
      encryptedValue: secret.encryptedValue,
    }));
  },
});

export const updateSecretBulk = protectedMutation({
  args: {
    environmentId: v.id("environment"),
    folderId: v.optional(v.id("folder")),
    secrets: v.array(
      v.object({
        secretId: v.optional(v.id("secret")),
        key: v.string(),
        encryptedValue: v.string(),
        valueType: v.union(v.literal("string"), v.literal("number"), v.literal("boolean")),
        scope: v.optional(v.union(v.literal("client"), v.literal("server"), v.literal("shared"))),
      }),
    ),
    mode: v.optional(v.union(v.literal("skip"), v.literal("overwrite"))),
    expectedKeyVersion: v.optional(v.number()),
  },
  returns: v.object({
    success: v.boolean(),
    updatedCount: v.number(),
    createdCount: v.number(),
    skippedCount: v.number(),
    secretIds: v.array(v.id("secret")),
  }),
  handler: async (
    ctx: ProtectedMutationCtx,
    args: {
      environmentId: Id<"environment">;
      folderId?: Id<"folder">;
      secrets: Array<{
        secretId?: Id<"secret">;
        key: string;
        encryptedValue: string;
        valueType: "string" | "number" | "boolean";
        scope?: "client" | "server" | "shared";
      }>;
      mode?: "skip" | "overwrite";
      expectedKeyVersion?: number;
    },
  ) => {
    if (args.secrets.length === 0) {
      throw createError({
        code: ErrorCode.INVALID_ARGUMENTS,
        message: "Cannot update empty secret list",
        severity: ErrorSeverity.Low,
      });
    }

    const environment: Doc<"environment"> = await ctx.runQuery(
      internal.environment._loadEnvironmentById,
      {
        environmentId: args.environmentId,
      },
    );

    const project: Doc<"project"> = await getProjectOrThrow(ctx, environment.projectId);

    await assertProjectAccess(ctx, project);

    await checkRateLimit(ctx, "write");

    assertExpectedKeyVersion(project, args.expectedKeyVersion);

    let folder: Doc<"folder"> | undefined;

    if (args.folderId) {
      folder = await ctx.runQuery(internal.folder._loadFolderById, {
        folderId: args.folderId,
      });

      if (!folder) {
        throw notFoundError("folder");
      }

      assertFolderInEnvironment(folder, environment);
    }

    const mode = args.mode || "skip";
    const updatedSecretIds: Id<"secret">[] = [];
    const createdSecretIds: Id<"secret">[] = [];
    let updatedCount = 0;
    let skippedCount = 0;

    // Check current secret count to ensure we don't exceed limit when creating new secrets
    const initialCount = await countActiveSecretsInEnvironment(ctx, args.environmentId);

    // Process each secret
    for (const secretInput of args.secrets) {
      let secret: Doc<"secret"> | null = null;

      // If secretId provided, load by ID
      if (secretInput.secretId) {
        secret = await ctx.runQuery(internal.secret._loadSecretById, {
          secretId: secretInput.secretId,
        });

        if (!secret) {
          if (mode === "skip") {
            skippedCount++;
            continue;
          }
          throw notFoundError("secret");
        }

        if (secret.isDeleted) {
          if (mode === "skip") {
            skippedCount++;
            continue;
          }
          throw createError({
            code: ErrorCode.INVALID_RESOURCE_STATE,
            message: "Cannot update a deleted secret. Restore it first",
            severity: ErrorSeverity.Low,
          });
        }

        if (secret.environmentId !== args.environmentId) {
          if (mode === "skip") {
            skippedCount++;
            continue;
          }
          throw createError({
            code: ErrorCode.INVALID_ARGUMENTS,
            message: "Secret does not belong to this environment",
            severity: ErrorSeverity.Medium,
          });
        }

        if (secretInput.key !== secret.key) {
          const clash = await findActiveSecretByKey(
            ctx,
            secret.environmentId,
            secret.folderId,
            secretInput.key,
          );
          if (clash && clash._id !== secret._id) {
            if (mode === "skip") {
              skippedCount++;
              continue;
            }
            alreadyExistsError("secret", ErrorSeverity.Medium);
          }
        }
      } else {
        // Load by key
        secret = await ctx.runQuery(internal.secret._loadSecretByKeyAndEnvironmentIdAndFolderId, {
          environmentId: args.environmentId,
          folderId: args.folderId,
          key: secretInput.key,
        });

        if (!secret) {
          // Always create new secret if not found (both skip and overwrite modes)
          // This allows updateSecretBulk to both update existing secrets and create new ones

          // Check if adding this new secret would exceed the limit
          if (initialCount + createdSecretIds.length >= MAX_SECRETS_PER_ENVIRONMENT) {
            if (mode === "skip") {
              skippedCount++;
              continue;
            }
            environmentLimitError(initialCount + createdSecretIds.length, secretInput.key);
          }

          const { secretId } = await ctx.runMutation(internal.secret._insertSecret, {
            createdBy: ctx.userId,
            encryptedValue: secretInput.encryptedValue,
            encryptionKeyVersion: project.keyVersion,
            valueType: secretInput.valueType,
            scope: secretInput.scope || "shared",
            projectId: project._id,
            environmentId: environment._id,
            folderId: args.folderId,
            key: secretInput.key,
          });

          await ctx.runMutation(internal.actionLog._insertActionLog, {
            projectId: project._id,
            projectName: project.name,
            userId: ctx.userId,
            action: "secret.created",
            environmentId: environment._id,
            environmentName: environment.name,
            metadata: {
              secretId,
              key: secretInput.key,
              folderId: args.folderId,
              folderName: folder?.name,
            },
          });

          createdSecretIds.push(secretId);
          updatedSecretIds.push(secretId);
          continue;
        }

        if (secret.isDeleted) {
          if (mode === "skip") {
            skippedCount++;
            continue;
          }
          throw createError({
            code: ErrorCode.INVALID_RESOURCE_STATE,
            message: "Cannot update a deleted secret. Restore it first",
            severity: ErrorSeverity.Low,
          });
        }
      }

      const newValueType =
        secretInput.valueType === "string"
          ? SecretValueType.String
          : secretInput.valueType === "number"
            ? SecretValueType.Number
            : SecretValueType.Boolean;

      const newScope = secretInput.scope || "shared";

      const isUnchanged =
        secret.encryptedValue === secretInput.encryptedValue &&
        secret.key === secretInput.key &&
        secret.valueType === newValueType &&
        secret.scope === newScope &&
        secret.encryptionKeyVersion === project.keyVersion;

      if (isUnchanged) {
        updatedSecretIds.push(secret._id);
        continue;
      }

      await ctx.runMutation(internal.secret._updateSecret, {
        secretId: secret._id,
        updates: {
          updatedBy: ctx.userId,
          key: secretInput.key,
          encryptedValue: secretInput.encryptedValue,
          encryptionKeyVersion: project.keyVersion,
          valueType: newValueType,
          scope: newScope,
        },
      });

      await ctx.runMutation(internal.actionLog._insertActionLog, {
        projectId: project._id,
        projectName: project.name,
        userId: ctx.userId,
        action: "secret.updated",
        environmentId: environment._id,
        environmentName: environment.name,
        metadata: {
          secretId: secret._id,
          key: secret.key,
          newKey: secretInput.key !== secret.key ? secretInput.key : undefined,
          folderId: args.folderId,
          folderName: folder?.name,
        },
      });

      updatedCount++;
      updatedSecretIds.push(secret._id);
    }

    return {
      success: true,
      updatedCount,
      createdCount: createdSecretIds.length,
      skippedCount,
      secretIds: updatedSecretIds,
    };
  },
});

export const updateSecret = protectedMutation({
  args: {
    secretId: v.id("secret"),
    updates: v.object({
      key: v.optional(v.string()),
      encryptedValue: v.optional(v.string()),
      valueType: v.union(
        v.literal(SecretValueType.String),
        v.literal(SecretValueType.Number),
        v.literal(SecretValueType.Boolean),
      ),
      scope: v.optional(v.union(v.literal("client"), v.literal("server"), v.literal("shared"))),
    }),
    expectedKeyVersion: v.optional(v.number()),
    // description: v.optional(v.string()),
    // tags: v.optional(v.array(v.string())),
  },
  handler: async (
    ctx: ProtectedMutationCtx,
    args: {
      secretId: Id<"secret">;
      updates: {
        key?: string;
        encryptedValue?: string;
        valueType?: SecretValueType;
        scope?: "client" | "server" | "shared";
      };
      expectedKeyVersion?: number;
    },
  ) => {
    const secret = await ctx.runQuery(internal.secret._loadSecretById, {
      secretId: args.secretId,
    });

    if (!secret) {
      throw notFoundError("secret");
    }

    if (secret.isDeleted) {
      throw createError({
        code: ErrorCode.INVALID_RESOURCE_STATE,
        message: "Cannot update a deleted secret. Restore it first",
        severity: ErrorSeverity.Low,
      });
    }

    const project = await getProjectOrThrow(ctx, secret.projectId);

    await assertProjectAccess(ctx, project);

    await checkRateLimit(ctx, "write");

    assertExpectedKeyVersion(project, args.expectedKeyVersion);
    await assertRenameAvailable(ctx, secret, args.updates.key);

    // update secret here, using project's current key version when value is updated
    await ctx.runMutation(internal.secret._updateSecret, {
      secretId: args.secretId,
      updates: {
        updatedBy: ctx.userId,
        key: args.updates.key,
        encryptedValue: args.updates.encryptedValue,
        encryptionKeyVersion: args.updates.encryptedValue ? project.keyVersion : undefined,
        valueType: args.updates.valueType,
        scope: args.updates.scope,
      },
    });

    let folder: Doc<"folder"> | undefined;

    if (secret.folderId) {
      folder = await ctx.runQuery(internal.folder._loadFolderById, {
        folderId: secret.folderId,
      });
    }

    const environment = await ctx.runQuery(internal.environment._loadEnvironmentById, {
      environmentId: secret.environmentId,
    });

    await ctx.runMutation(internal.actionLog._insertActionLog, {
      projectId: project._id,
      projectName: project.name,
      userId: ctx.userId,
      action: "secret.updated",
      environmentId: environment._id,
      environmentName: environment.name,
      metadata: {
        secretId: args.secretId,
        key: secret.key,
        newKey: args.updates.key,
        folderId: secret.folderId,
        folderName: folder?.name,
      },
    });

    return { success: true };
  },
});

export const deleteSecret = protectedMutation({
  args: {
    secretId: v.id("secret"),
  },
  handler: async (ctx: ProtectedMutationCtx, args: { secretId: Id<"secret"> }) => {
    const secret = await ctx.runQuery(internal.secret._loadSecretById, {
      secretId: args.secretId,
    });

    if (!secret) {
      throw notFoundError("secret");
    }

    if (secret.isDeleted) {
      throw createError({
        code: ErrorCode.INVALID_RESOURCE_STATE,
        message: "Cannot update a deleted secret. Restore it first",
        severity: ErrorSeverity.Low,
      });
    }

    const project = await getProjectOrThrow(ctx, secret.projectId);

    await assertProjectAccess(ctx, project);

    await checkRateLimit(ctx, "delete");

    await ctx.runMutation(internal.secret._updateSecret, {
      secretId: args.secretId,
      updates: {
        isDeleted: true,
        updatedBy: ctx.userId,
      },
    });

    let folder: Doc<"folder"> | undefined;

    if (secret.folderId) {
      folder = await ctx.runQuery(internal.folder._loadFolderById, {
        folderId: secret.folderId,
      });
    }

    const environment = await ctx.runQuery(internal.environment._loadEnvironmentById, {
      environmentId: secret.environmentId,
    });

    await ctx.runMutation(internal.actionLog._insertActionLog, {
      projectId: project._id,
      projectName: project.name,
      userId: ctx.userId,
      action: "secret.deleted",
      environmentId: secret.environmentId,
      environmentName: environment.name,
      metadata: {
        secretId: args.secretId,
        key: secret.key,
        folderId: secret.folderId,
        folderName: folder?.name,
      },
    });

    return { success: true };
  },
});

export const _exportSecretsCore = internalMutation({
  args: {
    userId: v.string(),
    apiKeyId: v.optional(v.id("apiKey")),
    projectId: v.id("project"),
    environmentName: v.optional(v.string()),
    environmentId: v.optional(v.id("environment")),
    folderName: v.optional(v.string()),
    folderId: v.optional(v.id("folder")),
    scope: v.optional(v.union(v.literal("client"), v.literal("server"), v.literal("shared"))),
    scopes: v.optional(
      v.array(v.union(v.literal("client"), v.literal("server"), v.literal("shared"))),
    ),
    push: v.optional(pushAuditValidator),
  },
  returns: v.object({
    secrets: v.array(
      v.object({
        id: v.id("secret"),
        key: v.string(),
        encryptedValue: v.string(),
        scope: v.union(v.literal("client"), v.literal("server"), v.literal("shared")),
        valueType: v.union(v.literal("string"), v.literal("number"), v.literal("boolean")),
      }),
    ),
    count: v.number(),
    encryptedProjectKey: v.string(),
    environmentId: v.id("environment"),
    folderId: v.union(v.id("folder"), v.null()),
  }),
  handler: async (
    ctx,
    args: {
      userId: string;
      apiKeyId?: Id<"apiKey">;
      projectId: Id<"project">;
      environmentName?: string;
      environmentId?: Id<"environment">;
      folderName?: string;
      folderId?: Id<"folder">;
      scope?: "client" | "server" | "shared";
      scopes?: Array<"client" | "server" | "shared">;
      push?: PushAudit;
    },
  ): Promise<ExportSecretsResult> => {
    const audit = buildExportAudit(args.push);

    if (args.apiKeyId) {
      await checkRateLimit(ctx, "apiKeyExport", `apiKeyExport:${args.apiKeyId}`);
    }

    const authCtx = {
      ...ctx,
      userId: args.userId,
      email: undefined,
      name: undefined,
    } as unknown as ProtectedMutationCtx;
    await checkRateLimit(authCtx, "read");

    const project = await getProjectOrThrow(ctx, args.projectId);

    await assertProjectAccess(authCtx, project);

    let encryptedProjectKey: string = project.encryptedProjectKey;
    if (project.ownerId !== args.userId) {
      const projectShare = await ctx.runQuery(
        internal.projectShare._loadActiveShareByProjectAndUser,
        {
          projectId: args.projectId,
          userId: args.userId,
        },
      );

      if (projectShare !== null) {
        encryptedProjectKey = projectShare.encryptedProjectKey;
      }
    }

    let resolvedEnvironmentId: Id<"environment">;
    let resolvedFolderId: Id<"folder"> | undefined;
    if (args.environmentName) {
      const { environmentId, folderId } = await ctx.runQuery(
        internal.secret._loadSecretLocationIdsPair,
        {
          projectId: args.projectId,
          environmentName: args.environmentName,
          folderName: args.folderName,
        },
      );
      resolvedEnvironmentId = environmentId;
      resolvedFolderId = folderId ?? undefined;
    } else if (args.environmentId) {
      resolvedEnvironmentId = args.environmentId;
      resolvedFolderId = args.folderId ?? undefined;
    } else {
      throw createError({
        code: ErrorCode.INVALID_ARGUMENTS,
        message: "Either environmentName or environmentId is required",
        severity: ErrorSeverity.Medium,
      });
    }

    const environment = await ctx.runQuery(internal.environment._loadEnvironmentById, {
      environmentId: resolvedEnvironmentId,
    });

    if (environment.projectId !== args.projectId) {
      throw createError({
        code: ErrorCode.INVALID_ARGUMENTS,
        message: "Environment does not belong to this project",
        severity: ErrorSeverity.Medium,
      });
    }

    let folder: Doc<"folder"> | undefined;
    if (resolvedFolderId) {
      folder = await ctx.runQuery(internal.folder._loadFolderById, {
        folderId: resolvedFolderId,
      });

      if (folder && folder.environmentId !== resolvedEnvironmentId) {
        throw createError({
          code: ErrorCode.INVALID_ARGUMENTS,
          message: "Folder does not belong to this environment",
          severity: ErrorSeverity.Medium,
        });
      }
    }

    const secrets: Doc<"secret">[] = await ctx.runQuery(internal.secret._loadSecrets, {
      environmentId: resolvedEnvironmentId,
      projectId: args.projectId,
      folderId: resolvedFolderId,
    });

    const scopeFilter = args.scopes ?? (args.scope ? [args.scope] : undefined);
    const filteredSecrets = scopeFilter
      ? secrets.filter((secret) => scopeFilter.includes(secret.scope))
      : secrets;

    await ctx.runMutation(internal.actionLog._insertActionLog, {
      projectId: project._id,
      projectName: project.name,
      userId: args.userId,
      action: audit.action,
      environmentId: resolvedEnvironmentId,
      environmentName: environment.name,
      metadata: {
        folderId: resolvedFolderId,
        folderName: folder?.name,
        exportCount: filteredSecrets.length,
        exportFormat: "env",
        ...audit.metadata,
      },
    });

    return {
      secrets: filteredSecrets.map((s) => ({
        id: s._id,
        key: s.key,
        encryptedValue: s.encryptedValue,
        scope: s.scope,
        valueType: s.valueType,
      })),
      count: filteredSecrets.length,
      encryptedProjectKey,
      environmentId: resolvedEnvironmentId,
      folderId: resolvedFolderId ?? null,
    };
  },
});

export const _exportSecretsForServiceAccount = internalMutation({
  args: {
    serviceAccountId: v.string(),
    projectId: v.id("project"),
    environmentName: v.optional(v.string()),
    folderName: v.optional(v.string()),
    scope: v.optional(v.union(v.literal("client"), v.literal("server"), v.literal("shared"))),
    scopes: v.optional(
      v.array(v.union(v.literal("client"), v.literal("server"), v.literal("shared"))),
    ),
    push: v.optional(pushAuditValidator),
  },
  returns: v.object({
    secrets: v.array(
      v.object({
        id: v.id("secret"),
        key: v.string(),
        encryptedValue: v.string(),
        scope: v.union(v.literal("client"), v.literal("server"), v.literal("shared")),
        valueType: v.union(v.literal("string"), v.literal("number"), v.literal("boolean")),
      }),
    ),
    count: v.number(),
    environmentId: v.id("environment"),
    folderId: v.union(v.id("folder"), v.null()),
  }),
  handler: async (
    ctx,
    args: {
      serviceAccountId: string;
      projectId: Id<"project">;
      environmentName?: string;
      folderName?: string;
      scope?: "client" | "server" | "shared";
      scopes?: Array<"client" | "server" | "shared">;
      push?: PushAudit;
    },
  ): Promise<ServiceAccountExportResult> => {
    const audit = buildExportAudit(args.push);

    await checkRateLimit(ctx, "serviceAccountExport", `saExport:${args.serviceAccountId}`);

    const project = await getProjectOrThrow(ctx, args.projectId);

    if (!args.environmentName) {
      throw createError({
        code: ErrorCode.INVALID_ARGUMENTS,
        message: "environmentName is required",
        severity: ErrorSeverity.Medium,
      });
    }

    const { environmentId, folderId } = await ctx.runQuery(
      internal.secret._loadSecretLocationIdsPair,
      {
        projectId: args.projectId,
        environmentName: args.environmentName,
        folderName: args.folderName,
      },
    );

    const environment = await ctx.runQuery(internal.environment._loadEnvironmentById, {
      environmentId,
    });

    if (environment.projectId !== args.projectId) {
      throw createError({
        code: ErrorCode.INVALID_ARGUMENTS,
        message: "Environment does not belong to this project",
        severity: ErrorSeverity.Medium,
      });
    }

    let folder: Doc<"folder"> | undefined;
    if (folderId) {
      folder = await ctx.runQuery(internal.folder._loadFolderById, { folderId });
      if (folder && folder.environmentId !== environmentId) {
        throw createError({
          code: ErrorCode.INVALID_ARGUMENTS,
          message: "Folder does not belong to this environment",
          severity: ErrorSeverity.Medium,
        });
      }
    }

    const secrets: Doc<"secret">[] = await ctx.runQuery(internal.secret._loadSecrets, {
      environmentId,
      projectId: args.projectId,
      folderId: folderId ?? undefined,
    });

    const scopeFilter = args.scopes ?? (args.scope ? [args.scope] : undefined);
    const filteredSecrets = scopeFilter
      ? secrets.filter((secret) => scopeFilter.includes(secret.scope))
      : secrets;

    await ctx.runMutation(internal.actionLog._insertActionLog, {
      projectId: project._id,
      projectName: project.name,
      userId: args.serviceAccountId,
      action: audit.action,
      environmentId,
      environmentName: environment.name,
      metadata: {
        folderId: folderId ?? undefined,
        folderName: folder?.name,
        exportCount: filteredSecrets.length,
        exportFormat: "env",
        ...audit.metadata,
      },
    });

    return {
      secrets: filteredSecrets.map((s) => ({
        id: s._id,
        key: s.key,
        encryptedValue: s.encryptedValue,
        scope: s.scope,
        valueType: s.valueType,
      })),
      count: filteredSecrets.length,
      environmentId,
      folderId: folderId ?? null,
    };
  },
});

export const exportSecrets = protectedMutation({
  args: {
    projectId: v.id("project"),
    environmentName: v.optional(v.string()),
    environmentId: v.optional(v.id("environment")),
    folderName: v.optional(v.string()),
    folderId: v.optional(v.id("folder")),
    scope: v.optional(v.union(v.literal("client"), v.literal("server"), v.literal("shared"))),
    scopes: v.optional(
      v.array(v.union(v.literal("client"), v.literal("server"), v.literal("shared"))),
    ),
    push: v.optional(pushAuditValidator),
  },
  handler: async (ctx: ProtectedMutationCtx, args): Promise<ExportSecretsResult> => {
    return await ctx.runMutation(internal.secret._exportSecretsCore, {
      userId: ctx.userId,
      ...args,
    });
  },
});

/** Lets HTTP actions turn untrusted id strings into ids, or reject them with a 400. */
export const _normalizeExportIds = internalQuery({
  args: {
    projectId: v.string(),
    environmentId: v.optional(v.string()),
    folderId: v.optional(v.string()),
  },
  returns: v.union(
    v.null(),
    v.object({
      projectId: v.id("project"),
      environmentId: v.optional(v.id("environment")),
      folderId: v.optional(v.id("folder")),
    }),
  ),
  handler: async (ctx, args) => {
    const projectId = ctx.db.normalizeId("project", args.projectId);
    const environmentId =
      args.environmentId === undefined
        ? undefined
        : ctx.db.normalizeId("environment", args.environmentId);
    const folderId =
      args.folderId === undefined ? undefined : ctx.db.normalizeId("folder", args.folderId);

    if (!projectId || environmentId === null || folderId === null) return null;
    return { projectId, environmentId, folderId };
type SecretNamesArgs = {
  projectId: Id<"project">;
  environmentName: string;
  folderName?: string;
  scope?: "client" | "server" | "shared";
};

type SecretNamesResult = {
  secrets: {
    key: string;
    scope: "client" | "server" | "shared";
    valueType: "string" | "number" | "boolean";
  }[];
  count: number;
  environmentId: Id<"environment">;
  folderId: Id<"folder"> | null;
};

const secretNamesArgs = {
  projectId: v.id("project"),
  environmentName: v.string(),
  folderName: v.optional(v.string()),
  scope: v.optional(v.union(v.literal("client"), v.literal("server"), v.literal("shared"))),
};

const secretNamesResult = v.object({
  secrets: v.array(
    v.object({
      key: v.string(),
      scope: v.union(v.literal("client"), v.literal("server"), v.literal("shared")),
      valueType: v.union(v.literal("string"), v.literal("number"), v.literal("boolean")),
    }),
  ),
  count: v.number(),
  environmentId: v.id("environment"),
  folderId: v.union(v.id("folder"), v.null()),
});

async function loadSecretNames(ctx: QueryCtx, args: SecretNamesArgs): Promise<SecretNamesResult> {
  const { environmentId, folderId } = await ctx.runQuery(
    internal.secret._loadSecretLocationIdsPair,
    {
      projectId: args.projectId,
      environmentName: args.environmentName,
      folderName: args.folderName,
    },
  );

  const secrets: Doc<"secret">[] = await ctx.runQuery(internal.secret._loadSecrets, {
    environmentId,
    projectId: args.projectId,
    folderId: folderId ?? undefined,
  });

  const filteredSecrets = args.scope
    ? secrets.filter((secret) => secret.scope === args.scope)
    : secrets;

  return {
    secrets: filteredSecrets.map((s) => ({
      key: s.key,
      scope: s.scope,
      valueType: s.valueType,
    })),
    count: filteredSecrets.length,
    environmentId,
    folderId,
  };
}

export const listSecretNames = protectedQuery({
  args: secretNamesArgs,
  returns: secretNamesResult,
  handler: async (ctx: ProtectedQueryCtx, args: SecretNamesArgs): Promise<SecretNamesResult> => {
    const project = await getProjectOrThrow(ctx, args.projectId);

    await assertProjectAccess(ctx, project);

    return await loadSecretNames(ctx, args);
  },
});

export const _listSecretNamesForUser = internalQuery({
  args: { userId: v.string(), ...secretNamesArgs },
  returns: secretNamesResult,
  handler: async (
    ctx,
    { userId, ...args }: SecretNamesArgs & { userId: string },
  ): Promise<SecretNamesResult> => {
    const authCtx = {
      ...ctx,
      userId,
      email: undefined,
      name: undefined,
    } as unknown as ProtectedQueryCtx;

    const project = await getProjectOrThrow(ctx, args.projectId);

    await assertProjectAccess(authCtx, project);

    return await loadSecretNames(ctx, args);
  },
});

// NOTE: callers must validate the service token first; it already pins the project and rejects archived ones.
export const _listSecretNamesForServiceAccount = internalQuery({
  args: secretNamesArgs,
  returns: secretNamesResult,
  handler: async (ctx, args: SecretNamesArgs): Promise<SecretNamesResult> => {
    return await loadSecretNames(ctx, args);
  },
});

export const _loadSecretLocationIdsPair = internalQuery({
  args: {
    projectId: v.id("project"),
    environmentName: v.string(),
    folderName: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    environmentId: Id<"environment">;
    folderId: Id<"folder"> | null;
  }> => {
    const environment = await ctx.runQuery(
      internal.environment._loadEnvironmentByProjectIdAndSlug,
      {
        projectId: args.projectId,
        slug: generateSlug(args.environmentName),
      },
    );

    if (!environment) {
      throw notFoundError("environment");
    }

    const environmentId: Id<"environment"> = environment._id;
    let folderId: Id<"folder"> | null = null;

    if (args.folderName) {
      const folder = await ctx.runQuery(internal.folder._loadFolderBySlug, {
        environmentId: environment._id,
        slug: generateSlug(args.folderName),
      });

      if (!folder) {
        throw notFoundError("folder");
      }

      folderId = folder._id;
    }

    return {
      environmentId,
      folderId,
    };
  },
});

export const _loadSecretById = internalQuery({
  args: {
    secretId: v.id("secret"),
  },
  returns: v.union(v.null(), doc(schema, "secret")),
  handler: async (ctx, args: { secretId: Id<"secret"> }) => {
    return await ctx.db.get(args.secretId);
  },
});

export const _loadSecrets = internalQuery({
  args: {
    projectId: v.id("project"),
    environmentId: v.id("environment"),
    folderId: v.optional(v.id("folder")),
  },
  returns: v.array(doc(schema, "secret")),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("secret")
      .withIndex("by_env_folder_key", (q) =>
        q.eq("environmentId", args.environmentId).eq("folderId", args.folderId),
      )
      .filter((q) =>
        q.and(q.eq(q.field("projectId"), args.projectId), q.eq(q.field("isDeleted"), false)),
      )
      .collect();
  },
});

export const _loadSecretByKeyAndEnvironmentIdAndFolderId = internalQuery({
  args: {
    key: v.string(),
    environmentId: v.id("environment"),
    folderId: v.optional(v.id("folder")),
  },
  returns: v.union(doc(schema, "secret"), v.null()),
  handler: async (
    ctx,
    args: { key: string; environmentId: Id<"environment">; folderId?: Id<"folder"> },
  ) => findActiveSecretByKey(ctx, args.environmentId, args.folderId, args.key),
});

export const _loadSecretsByEnvironmentId = internalQuery({
  args: {
    environmentId: v.id("environment"),
  },
  returns: v.array(doc(schema, "secret")),
  handler: async (ctx, args: { environmentId: Id<"environment"> }) => {
    return await ctx.db
      .query("secret")
      .withIndex("by_environment_deleted", (q) =>
        q.eq("environmentId", args.environmentId).eq("isDeleted", false),
      )
      .collect();
  },
});

export const _loadSecretsByFolderId = internalQuery({
  args: {
    folderId: v.id("folder"),
  },
  returns: v.array(doc(schema, "secret")),
  handler: async (ctx, args: { folderId: Id<"folder"> }) => {
    return await ctx.db
      .query("secret")
      .withIndex("by_folder", (q) => q.eq("folderId", args.folderId))
      .filter((q) => q.eq(q.field("isDeleted"), false))
      .collect();
  },
});

export const _loadSecretsByProjectId = internalQuery({
  args: {
    projectId: v.id("project"),
  },
  returns: v.array(doc(schema, "secret")),
  handler: async (ctx, args: { projectId: Id<"project"> }) => {
    return await ctx.db
      .query("secret")
      .withIndex("by_project_deleted", (q) =>
        q.eq("projectId", args.projectId).eq("isDeleted", false),
      )
      .collect();
  },
});

export const _validateSecretsForRotation = internalQuery({
  args: {
    secretIds: v.array(v.id("secret")),
    projectId: v.id("project"),
  },
  returns: v.object({
    valid: v.boolean(),
    missingSecretIds: v.array(v.id("secret")),
    wrongProjectSecretIds: v.array(v.id("secret")),
    totalExpected: v.number(),
  }),
  handler: async (ctx, args: { secretIds: Id<"secret">[]; projectId: Id<"project"> }) => {
    if (args.secretIds.length === 0) {
      return {
        valid: true,
        missingSecretIds: [],
        wrongProjectSecretIds: [],
        totalExpected: 0,
      };
    }

    const secrets = await Promise.all(args.secretIds.map((id) => ctx.db.get(id)));

    const missingSecretIds: Id<"secret">[] = [];
    const wrongProjectSecretIds: Id<"secret">[] = [];

    for (let i = 0; i < secrets.length; i++) {
      const secret = secrets[i];
      const secretId = args.secretIds[i];

      if (secretId === undefined) {
        continue;
      }

      if (!secret || secret.isDeleted) {
        missingSecretIds.push(secretId);
      } else if (secret.projectId !== args.projectId) {
        wrongProjectSecretIds.push(secretId);
      }
    }

    return {
      valid: missingSecretIds.length === 0 && wrongProjectSecretIds.length === 0,
      missingSecretIds,
      wrongProjectSecretIds,
      totalExpected: args.secretIds.length,
    };
  },
});

export const _insertSecret = internalMutation({
  args: {
    projectId: v.id("project"),
    environmentId: v.id("environment"),
    folderId: v.optional(v.id("folder")),
    key: v.string(),
    encryptedValue: v.string(),
    // description: v.string(),
    encryptionKeyVersion: v.number(),
    valueType: v.union(v.literal("string"), v.literal("number"), v.literal("boolean")),
    scope: v.union(v.literal("client"), v.literal("server"), v.literal("shared")),
    // tags: v.array(v.string()),
    createdBy: v.string(),
  },
  returns: v.object({ success: v.boolean(), secretId: v.id("secret") }),
  handler: async (
    ctx,
    args: {
      projectId: Id<"project">;
      environmentId: Id<"environment">;
      folderId?: Id<"folder">;
      key: string;
      encryptedValue: string;
      encryptionKeyVersion: number;
      valueType: "string" | "number" | "boolean";
      scope: "client" | "server" | "shared";
      createdBy: string;
    },
  ) => {
    const now = Date.now();

    const secretId = await ctx.db.insert("secret", {
      projectId: args.projectId,
      environmentId: args.environmentId,
      folderId: args.folderId,
      key: args.key,
      encryptedValue: args.encryptedValue,
      // description: args.description,
      encryptionKeyVersion: args.encryptionKeyVersion,
      valueType: args.valueType,
      // tags: args.tags,
      scope: args.scope,
      isDeleted: false,
      createdBy: args.createdBy,
      createdAt: now,
      updatedBy: args.createdBy,
      updatedAt: now,
    });

    if (args.folderId) {
      await ctx.runMutation(internal.folder._updateLastUpdateTime, {
        folderId: args.folderId,
      });
    } else {
      await ctx.runMutation(internal.environment._updateLastUpdateTime, {
        environmentId: args.environmentId,
      });
    }

    return { success: true, secretId };
  },
});

export const _updateSecret = internalMutation({
  args: {
    secretId: v.id("secret"),
    updates: v.object({
      updatedBy: v.string(),
      key: v.optional(v.string()),
      encryptedValue: v.optional(v.string()),
      encryptionKeyVersion: v.optional(v.number()),
      valueType: v.optional(
        v.union(
          v.literal(SecretValueType.String),
          v.literal(SecretValueType.Number),
          v.literal(SecretValueType.Boolean),
        ),
      ),
      scope: v.optional(v.union(v.literal("client"), v.literal("server"), v.literal("shared"))),
      isDeleted: v.optional(v.boolean()),
      // description: v.optional(v.string()),
      // tags: v.optional(v.array(v.string())),
    }),
  },
  returns: v.object({ success: v.boolean() }),
  handler: async (
    ctx,
    args: {
      secretId: Id<"secret">;
      updates: {
        updatedBy: string;
        key?: string;
        encryptedValue?: string;
        encryptionKeyVersion?: number;
        valueType?: SecretValueType;
        scope?: "client" | "server" | "shared";
        isDeleted?: boolean;
      };
    },
  ) => {
    const now = Date.now();
    const updates: {
      updatedBy: string;
      updatedAt: number;
      key?: string;
      encryptedValue?: string;
      encryptionKeyVersion?: number;
      valueType?: SecretValueType;
      scope?: "client" | "server" | "shared";
      isDeleted?: boolean;
      // description?: string;
      // tags?: string[];
    } = {
      updatedBy: args.updates.updatedBy,
      updatedAt: now,
    };

    if (args.updates.key !== undefined) updates.key = args.updates.key;
    if (args.updates.encryptedValue !== undefined)
      updates.encryptedValue = args.updates.encryptedValue;
    if (args.updates.encryptionKeyVersion !== undefined)
      updates.encryptionKeyVersion = args.updates.encryptionKeyVersion;
    if (args.updates.valueType !== undefined) updates.valueType = args.updates.valueType;
    if (args.updates.scope !== undefined) updates.scope = args.updates.scope;
    if (args.updates.isDeleted !== undefined) updates.isDeleted = args.updates.isDeleted;
    // if (args.updates.description !== undefined) updates.description = args.updates.description;
    // if (args.updates.tags !== undefined) updates.tags = args.updates.tags;

    await ctx.db.patch(args.secretId, updates);

    const secret = await ctx.runQuery(internal.secret._loadSecretById, {
      secretId: args.secretId,
    });

    // NOTE: If the secret is not found, it won't affect the execution of this Convex handler.
    // However, it may cause issues with the CLI cache.
    if (secret) {
      if (secret.folderId) {
        await ctx.runMutation(internal.folder._updateLastUpdateTime, {
          folderId: secret.folderId,
        });
      } else {
        await ctx.runMutation(internal.environment._updateLastUpdateTime, {
          environmentId: secret?.environmentId,
        });
      }
    }

    return { success: true };
  },
});

export const _reEncryptSecretsForKeyRotation = internalMutation({
  args: {
    userId: v.string(),
    secrets: v.array(
      v.object({
        secretId: v.id("secret"),
        newEncryptedValue: v.string(),
        newEncryptionKeyVersion: v.number(),
      }),
    ),
  },
  returns: v.object({
    success: v.boolean(),
    totalEncrypted: v.number(),
  }),
  handler: async (
    ctx,
    args: {
      userId: string;
      secrets: Array<{
        secretId: Id<"secret">;
        newEncryptedValue: string;
        newEncryptionKeyVersion: number;
      }>;
    },
  ) => {
    // NOTE: Caller MUST validate secrets via _validateSecretsForRotation before calling this.
    // This mutation assumes all secretIds are valid to maintain atomicity.
    if (args.secrets.length === 0) {
      return { success: true, totalEncrypted: 0 };
    }

    let totalEncrypted = 0;
    const now = Date.now();

    for (const { secretId, newEncryptedValue, newEncryptionKeyVersion } of args.secrets) {
      await ctx.db.patch(secretId, {
        encryptedValue: newEncryptedValue,
        encryptionKeyVersion: newEncryptionKeyVersion,
        updatedAt: now,
        updatedBy: args.userId,
      });
      totalEncrypted++;
    }

    return { success: true, totalEncrypted };
  },
});
