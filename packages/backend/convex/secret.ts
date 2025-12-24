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
  SecretPrimitiveType,
} from "./lib/types";
import schema from "./schema";

// INFO: should i add a secret limit in an environment

export const createSecret = protectedMutation({
  args: {
    environmentId: v.id("environment"),
    folderId: v.optional(v.id("folder")),
    key: v.string(),
    encryptedValue: v.string(),
    primitiveType: v.union(v.literal("string"), v.literal("number"), v.literal("boolean")),
    // description: v.optional(v.string()),
    encryptionKeyVersion: v.number(),
    // tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx: ProtectedMutationCtx, args) => {
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

    // create secret
    const { secretId } = await ctx.runMutation(internal.secret._insertSecret, {
      createdBy: ctx.userId,
      encryptedValue: args.encryptedValue,
      encryptionKeyVersion: args.encryptionKeyVersion,
      environmentId: args.environmentId,
      key: args.key,
      primitiveType: args.primitiveType,
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
      primitiveType: secretInstance.primitiveType,
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

export const updateSecret = protectedMutation({
  args: {
    secretId: v.id("secret"),
    updates: v.object({
      key: v.optional(v.string()),
      encryptedValue: v.optional(v.string()),
      encryptionKeyVersion: v.optional(v.number()),
      primitiveType: v.union(
        v.literal(SecretPrimitiveType.String),
        v.literal(SecretPrimitiveType.Number),
        v.literal(SecretPrimitiveType.Boolean),
      ),
    }),
    // description: v.optional(v.string()),
    // tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx: ProtectedMutationCtx, args) => {
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

    // update secret here
    await ctx.runMutation(internal.secret._updateSecret, {
      secretId: args.secretId,
      updates: {
        updatedBy: ctx.userId,
        key: args.updates.key,
        encryptedValue: args.updates.encryptedValue,
        encryptionKeyVersion: args.updates.encryptionKeyVersion,
        primitiveType: args.updates.primitiveType,
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
  handler: async (ctx: ProtectedMutationCtx, args) => {
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
  handler: async (ctx, args) => {
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
  handler: async (ctx, args) => {
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
  handler: async (ctx, args) => {
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
  handler: async (ctx, args) => {
    return await ctx.db
      .query("secret")
      .withIndex("by_folder", (q) => q.eq("folderId", args.folderId))
      .filter((q) => q.eq(q.field("isDeleted"), false))
      .collect();
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
    primitiveType: v.union(v.literal("string"), v.literal("number"), v.literal("boolean")),
    // tags: v.array(v.string()),
    createdBy: v.id("user"),
  },
  returns: v.object({ success: v.boolean(), secretId: v.id("secret") }),
  handler: async (ctx, args) => {
    const now = Date.now();

    const secretId = await ctx.db.insert("secret", {
      projectId: args.projectId,
      environmentId: args.environmentId,
      folderId: args.folderId,
      key: args.key,
      encryptedValue: args.encryptedValue,
      // description: args.description,
      encryptionKeyVersion: args.encryptionKeyVersion,
      primitiveType: args.primitiveType,
      // tags: args.tags,
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
      updatedBy: v.id("user"),
      key: v.optional(v.string()),
      encryptedValue: v.optional(v.string()),
      encryptionKeyVersion: v.optional(v.number()),
      primitiveType: v.optional(
        v.union(
          v.literal(SecretPrimitiveType.String),
          v.literal(SecretPrimitiveType.Number),
          v.literal(SecretPrimitiveType.Boolean),
        ),
      ),
      isDeleted: v.optional(v.boolean()),
      // description: v.optional(v.string()),
      // tags: v.optional(v.array(v.string())),
    }),
  },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const updates: {
      updatedBy: BetterAuthId<"user">;
      updatedAt: number;
      key?: string;
      encryptedValue?: string;
      encryptionKeyVersion?: number;
      primitiveType?: SecretPrimitiveType;
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
    if (args.updates.primitiveType !== undefined)
      updates.primitiveType = args.updates.primitiveType;
    if (args.updates.isDeleted !== undefined) updates.isDeleted = args.updates.isDeleted;
    // if (args.updates.description !== undefined) updates.description = args.updates.description;
    // if (args.updates.tags !== undefined) updates.tags = args.updates.tags;

    await ctx.db.patch(args.secretId, updates);

    return { success: true };
  },
});

export const _reEncryptSecretsForKeyRotation = internalMutation({
  args: {
    userId: v.id("user"),
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
  handler: async (ctx, args) => {
    if (args.secrets.length === 0) {
      return { success: true, totalEncrypted: 0 };
    }

    const secretsData = await Promise.all(
      args.secrets.map(async (item) => ({
        ...item,
        secret: await ctx.db.get(item.secretId),
      })),
    );

    const validSecrets = secretsData.filter((item) => {
      if (!item.secret) {
        console.error(`Secret ${item.secretId} not found`);
        return false;
      }
      return true;
    });

    if (validSecrets.length === 0) {
      return { success: false, totalEncrypted: 0 };
    }

    let totalEncrypted = 0;
    const now = Date.now();

    for (const { secretId, newEncryptedValue, newEncryptionKeyVersion } of validSecrets) {
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
