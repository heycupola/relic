import { v } from "convex/values";
import { doc } from "convex-helpers/validators";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Id as BetterAuthId } from "./betterAuth/_generated/dataModel";
import { assertProjectAccess } from "./lib/access";
import { alreadyExistsError, createError, ErrorCode, notFoundError } from "./lib/errors";
import { protectedMutation, protectedQuery } from "./lib/middleware";
import { checkRateLimit } from "./lib/rateLimit";
import {
  ErrorSeverity,
  type ProtectedMutationCtx,
  type ProtectedQueryCtx,
  SecretValueType,
} from "./lib/types";
import schema from "./schema";

const MAX_SECRETS_PER_ENVIRONMENT = 1024;

export const createSecret = protectedMutation({
  args: {
    environmentId: v.id("environment"),
    folderId: v.optional(v.id("folder")),
    key: v.string(),
    encryptedValue: v.string(),
    valueType: v.union(v.literal("string"), v.literal("number"), v.literal("boolean")),
    scope: v.optional(v.union(v.literal("client"), v.literal("server"), v.literal("shared"))),
    // description: v.optional(v.string()),
    // tags: v.optional(v.array(v.string())),
  },
  handler: async (
    ctx: ProtectedMutationCtx,
    args: {
      environmentId: Id<"environment">;
      folderId?: Id<"folder">;
      key: string;
      encryptedValue: string;
      valueType: "string" | "number" | "boolean";
      scope?: "client" | "server" | "shared";
    },
  ) => {
    const environment = await ctx.runQuery(internal.environment._loadEnvironmentById, {
      environmentId: args.environmentId,
    });

    const project = await ctx.runQuery(internal.project._loadProjectById, {
      projectId: environment.projectId,
    });

    await assertProjectAccess(ctx, project);

    await checkRateLimit(ctx, "write");

    let folder: Doc<"folder"> | undefined;

    if (args.folderId) {
      // NOTE: loads and checks the folder's existence
      folder = await ctx.runQuery(internal.folder._loadFolderId, {
        folderId: args.folderId,
      });
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

    // create secret using project's current key version
    const { secretId } = await ctx.runMutation(internal.secret._insertSecret, {
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

    await ctx.runMutation(internal.actionLog._logSecretAction, {
      environmentId: environment._id,
      environmentName: environment.name,
      key: args.key,
      projectId: project._id,
      projectName: project.name,
      secretAction: "secret.created",
      secretId,
      userId: ctx.userId,
      folderId: args.folderId,
      folderName: folder?.name,
    });

    const sId: Id<"secret"> = secretId;

    return { success: true, secretId: sId };
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

    if (!secretInstance) {
      throw notFoundError("secret");
    }

    const project = await ctx.runQuery(internal.project._loadProjectById, {
      projectId: secretInstance.projectId,
    });

    await assertProjectAccess(ctx, project);

    // TODO: add actionLog here

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

    const project: Doc<"project"> = await ctx.runQuery(internal.project._loadProjectById, {
      projectId: environment.projectId,
    });

    await assertProjectAccess(ctx, project);

    await checkRateLimit(ctx, "write");

    let folder: Doc<"folder"> | undefined;

    if (args.folderId) {
      folder = await ctx.runQuery(internal.folder._loadFolderId, {
        folderId: args.folderId,
      });

      if (!folder) {
        throw notFoundError("folder");
      }

      if (folder.environmentId !== args.environmentId) {
        throw createError({
          code: ErrorCode.INVALID_ARGUMENTS,
          message: "Folder does not belong to this environment",
          severity: ErrorSeverity.Medium,
        });
      }
    }

    const mode = args.mode || "skip";
    const updatedSecretIds: Id<"secret">[] = [];
    const createdSecretIds: Id<"secret">[] = [];
    let updatedCount = 0;
    let skippedCount = 0;

    // Check current secret count to ensure we don't exceed limit when creating new secrets
    const existingSecrets = await ctx.runQuery(internal.secret._loadSecretsByEnvironmentId, {
      environmentId: args.environmentId,
    });
    let currentCount = existingSecrets.length;

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
          if (currentCount >= MAX_SECRETS_PER_ENVIRONMENT) {
            if (mode === "skip") {
              skippedCount++;
              continue;
            }
            throw createError({
              code: ErrorCode.ENVIRONMENT_LIMIT_REACHED,
              message: `Cannot create new secret "${secretInput.key}". Environment already has ${currentCount} secrets. Maximum ${MAX_SECRETS_PER_ENVIRONMENT} secrets per environment.`,
              severity: ErrorSeverity.High,
            });
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

          await ctx.runMutation(internal.actionLog._logSecretAction, {
            environmentId: environment._id,
            environmentName: environment.name,
            key: secretInput.key,
            projectId: project._id,
            projectName: project.name,
            secretAction: "secret.created",
            secretId,
            userId: ctx.userId,
            folderId: args.folderId,
            folderName: folder?.name,
          });

          createdSecretIds.push(secretId);
          updatedSecretIds.push(secretId);
          currentCount++;
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

      await ctx.runMutation(internal.actionLog._logSecretAction, {
        environmentId: environment._id,
        environmentName: environment.name,
        key: secret.key,
        newKey: secretInput.key !== secret.key ? secretInput.key : undefined,
        projectId: project._id,
        projectName: project.name,
        secretAction: "secret.updated",
        secretId: secret._id,
        userId: ctx.userId,
        folderId: args.folderId,
        folderName: folder?.name,
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

    const project = await ctx.runQuery(internal.project._loadProjectById, {
      projectId: secret.projectId,
    });

    await assertProjectAccess(ctx, project);

    await checkRateLimit(ctx, "write");

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
      folder = await ctx.runQuery(internal.folder._loadFolderId, {
        folderId: secret.folderId,
      });
    }

    const environment = await ctx.runQuery(internal.environment._loadEnvironmentById, {
      environmentId: secret.environmentId,
    });

    await ctx.runMutation(internal.actionLog._logSecretAction, {
      environmentId: environment._id,
      environmentName: environment.name,
      key: secret.key,
      newKey: args.updates.key,
      projectId: project._id,
      projectName: project.name,
      secretAction: "secret.updated",
      secretId: args.secretId,
      userId: ctx.userId,
      folderId: secret.folderId,
      folderName: folder?.name,
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

    const project = await ctx.runQuery(internal.project._loadProjectById, {
      projectId: secret.projectId,
    });

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
      folder = await ctx.runQuery(internal.folder._loadFolderId, {
        folderId: secret.folderId,
      });
    }

    const environment = await ctx.runQuery(internal.environment._loadEnvironmentById, {
      environmentId: secret.environmentId,
    });

    await ctx.runMutation(internal.actionLog._logSecretAction, {
      environmentId: secret.environmentId,
      environmentName: environment.name,
      key: secret.key,
      projectId: project._id,
      projectName: project.name,
      secretAction: "secret.deleted",
      secretId: args.secretId,
      userId: ctx.userId,
      folderId: secret.folderId,
      folderName: folder?.name,
    });

    return { success: true };
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
  ) => {
    const secret = await ctx.db
      .query("secret")
      .withIndex("by_env_and_key", (q) =>
        q.eq("environmentId", args.environmentId).eq("key", args.key),
      )
      .filter((q) =>
        q.and(q.eq(q.field("isDeleted"), false), q.eq(q.field("folderId"), args.folderId)),
      )
      .first();

    return secret;
  },
});

export const _loadSecretsByEnvironmentId = internalQuery({
  args: {
    environmentId: v.id("environment"),
  },
  returns: v.array(doc(schema, "secret")),
  handler: async (ctx, args: { environmentId: Id<"environment"> }) => {
    return await ctx.db
      .query("secret")
      .withIndex("by_environment", (q) => q.eq("environmentId", args.environmentId))
      .filter((q) => q.eq(q.field("isDeleted"), false))
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
