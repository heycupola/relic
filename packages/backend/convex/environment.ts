import { v } from "convex/values";
import { doc } from "convex-helpers/validators";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Id as BetterAuthId } from "./betterAuth/_generated/dataModel";
import { assertProjectAccess } from "./lib/access";
import { alreadyExistsError, createError, ErrorCode, notFoundError } from "./lib/errors";
import { generateSlug } from "./lib/helpers";
import { protectedMutation, protectedQuery } from "./lib/middleware";
import { checkRateLimit } from "./lib/rateLimit";
import { ErrorSeverity, type ProtectedMutationCtx, type ProtectedQueryCtx } from "./lib/types";
import schema from "./schema";

const MAX_ENV_COUNT = 32;

export const createEnvironment = protectedMutation({
  args: {
    projectId: v.id("project"),
    name: v.string(),
    // slug: v.string(),
    // description: v.optional(v.string()),
    // color: v.optional(v.string()),
  },
  handler: async (
    ctx: ProtectedMutationCtx,
    args: {
      projectId: Id<"project">;
      name: string;
      // slug: string;
      // description?: string;
      // color?: string;
    },
  ): Promise<{ success: boolean; environmentId: Id<"environment"> }> => {
    const project = await ctx.runQuery(internal.project._loadProjectById, {
      projectId: args.projectId,
    });

    await assertProjectAccess(ctx, project);

    await checkRateLimit(ctx, "write");

    const existingEnv = await ctx.runQuery(
      internal.environment._loadEnvironmentByProjectIdAndSlug,
      { projectId: args.projectId, slug: generateSlug(args.name) },
    );

    if (existingEnv) {
      throw alreadyExistsError("environment");
    }

    const projectEnvironments = await ctx.runQuery(internal.environment._getProjectEnvironments, {
      projectId: args.projectId,
    });

    if (projectEnvironments.length >= MAX_ENV_COUNT) {
      throw createError({
        code: ErrorCode.ENVIRONMENT_LIMIT_REACHED,
        message: `You've reached the maximum number of environments (${MAX_ENV_COUNT}) for this project`,
        severity: ErrorSeverity.High,
      });
    }

    const maxSortOrder = projectEnvironments.reduce((max, env) => Math.max(max, env.sortOrder), -1);

    const environmentId = await ctx.runMutation(internal.environment._insertEnvironment, {
      createdBy: ctx.userId,
      sortOrder: maxSortOrder + 1,
      name: args.name,
      projectId: project._id,
    });

    return { success: true, environmentId };
  },
});

export const updateEnvironment = protectedMutation({
  args: {
    environmentId: v.id("environment"),
    name: v.optional(v.string()),
    // description: v.optional(v.string()),
    // color: v.optional(v.string()),
    // sortOrder: v.optional(v.number()),
  },
  handler: async (
    ctx: ProtectedMutationCtx,
    args: {
      environmentId: Id<"environment">;
      name?: string;
      // description?: string;
      // color?: string;
      // sortOrder?: number;
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

    await ctx.runMutation(internal.environment._updateEnvironment, {
      environmentId: args.environmentId,
      updates: {
        name: args.name,
        // sortOrder: args.sortOrder,
      },
    });

    return { success: true };
  },
});

export const deleteEnvironment = protectedMutation({
  args: {
    environmentId: v.id("environment"),
  },
  handler: async (ctx: ProtectedMutationCtx, args: { environmentId: Id<"environment"> }) => {
    const environment = await ctx.runQuery(internal.environment._loadEnvironmentById, {
      environmentId: args.environmentId,
    });

    const project = await ctx.runQuery(internal.project._loadProjectById, {
      projectId: environment.projectId,
    });

    await assertProjectAccess(ctx, project);

    await checkRateLimit(ctx, "delete");

    const secrets = await ctx.runQuery(internal.secret._loadSecretsByEnvironmentId, {
      environmentId: args.environmentId,
    });

    if (secrets.length > 0) {
      throw createError({
        code: ErrorCode.CANNOT_DELETE_NON_EMPTY,
        message: "Cannot delete environment with active secrets. Please delete all secrets first.",
        severity: ErrorSeverity.High,
      });
    }

    const folders = await ctx.runQuery(internal.folder._loadFoldersByEnvironmentId, {
      environmentId: args.environmentId,
    });

    if (folders.length > 0) {
      throw createError({
        code: ErrorCode.CANNOT_DELETE_NON_EMPTY,
        message: "Cannot delete environment with active folders. Please delete all folders first.",
        severity: ErrorSeverity.High,
      });
    }

    await ctx.runMutation(internal.environment._deleteEnvironmentById, {
      environmentId: args.environmentId,
    });

    return { success: true };
  },
});

export const getEnvironmentData = protectedQuery({
  args: {
    environmentId: v.id("environment"),
  },
  handler: async (ctx: ProtectedQueryCtx, args) => {
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

    const secrets: Doc<"secret">[] = await ctx.runQuery(
      internal.secret._loadSecretsByEnvironmentId,
      {
        environmentId: args.environmentId,
      },
    );
    const folders: Doc<"folder">[] = await ctx.runQuery(
      internal.folder._loadFoldersByEnvironmentId,
      {
        environmentId: args.environmentId,
      },
    );

    type SecretSummary = {
      id: Id<"secret">;
      key: string;
      encryptedValue: string;
      valueType: string;
      createdBy: BetterAuthId<"user">;
      createdAt: number;
      updatedBy: BetterAuthId<"user">;
      updatedAt: number;
    };

    const secretsByLocation = secrets.reduce<{
      root: SecretSummary[];
      byFolder: Record<string, SecretSummary[]>;
    }>(
      (
        acc: { root: SecretSummary[]; byFolder: Record<string, SecretSummary[]> },
        secret: Doc<"secret">,
      ) => {
        const summary: SecretSummary = {
          id: secret._id,
          key: secret.key,
          encryptedValue: secret.encryptedValue,
          valueType: secret.valueType,
          createdBy: secret.createdBy,
          createdAt: secret.createdAt,
          updatedBy: secret.updatedBy,
          updatedAt: secret.updatedAt,
        };

        if (secret.folderId) {
          if (!acc.byFolder[secret.folderId]) {
            acc.byFolder[secret.folderId] = [];
          }
          acc.byFolder[secret.folderId]?.push(summary);
        } else {
          acc.root.push(summary);
        }
        return acc;
      },
      { root: [], byFolder: {} },
    );

    return {
      environment: {
        id: environment._id,
        name: environment.name,
        slug: environment.slug,
        description: environment.description,
        color: environment.color,
        sortOrder: environment.sortOrder,
        createdBy: environment.createdBy,
        createdAt: environment.createdAt,
        updatedAt: environment.updatedAt,
      },
      folders: folders.map((folder: Doc<"folder">) => ({
        id: folder._id,
        name: folder.name,
        slug: folder.slug,
        path: folder.path,
        createdAt: folder.createdAt,
        updatedAt: folder.updatedAt,
        secrets: secretsByLocation.byFolder[folder._id] || [],
      })),
      rootSecrets: secretsByLocation.root,
      stats: {
        totalSecrets: secrets.length,
        totalFolders: folders.length,
      },
    };
  },
});

export const _loadEnvironmentById = internalQuery({
  args: {
    environmentId: v.id("environment"),
  },
  returns: doc(schema, "environment"),
  handler: async (ctx, args) => {
    const environment = await ctx.db.get(args.environmentId);

    if (!environment) {
      throw notFoundError("environment");
    }

    return environment;
  },
});

export const _loadEnvironmentByProjectIdAndSlug = internalQuery({
  args: {
    projectId: v.id("project"),
    slug: v.string(),
  },
  returns: v.union(v.null(), doc(schema, "environment")),
  handler: async (ctx, args) => {
    const environment = await ctx.db
      .query("environment")
      .withIndex("by_project_and_slug", (q) =>
        q.eq("projectId", args.projectId).eq("slug", args.slug),
      )
      .first();

    return environment;
  },
});

export const _getProjectEnvironments = internalQuery({
  args: {
    projectId: v.id("project"),
  },
  returns: v.array(doc(schema, "environment")),
  handler: async (ctx, args) => {
    const environments = await ctx.db
      .query("environment")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    return environments.sort((a, b) => a.sortOrder - b.sortOrder);
  },
});

export const _insertEnvironment = internalMutation({
  args: {
    projectId: v.id("project"),
    name: v.string(),
    sortOrder: v.number(),
    createdBy: v.id("user"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const slug = generateSlug(args.name);

    return await ctx.db.insert("environment", {
      projectId: args.projectId,
      name: args.name,
      slug,
      description: undefined,
      color: undefined,
      sortOrder: args.sortOrder,
      createdBy: args.createdBy,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const _updateEnvironment = internalMutation({
  args: {
    environmentId: v.id("environment"),
    updates: v.object({
      name: v.optional(v.string()),
      // description: v.optional(v.string()),
      // color: v.optional(v.string()),
      // sortOrder: v.optional(v.number()),
    }),
  },
  handler: async (ctx, args) => {
    const updates: {
      updatedAt: number;
      slug?: string;
      name?: string;
      // description?: string;
      // color?: string;
      // sortOrder?: number;
    } = { updatedAt: Date.now() };
    if (args.updates.name !== undefined) {
      updates.name = args.updates.name;
      updates.slug = generateSlug(updates.name);
    }
    // if (args.updates.description !== undefined) updates.description = args.updates.description;
    // if (args.updates.color !== undefined) updates.color = args.updates.color;
    // if (args.updates.sortOrder !== undefined) updates.sortOrder = args.updates.sortOrder;

    await ctx.db.patch(args.environmentId, updates);
  },
});

export const _deleteEnvironmentById = internalMutation({
  args: {
    environmentId: v.id("environment"),
  },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.environmentId);
  },
});

// NOTE: this could be a feature in the future
// export const reorderEnvironments = protectedMutation({
//   args: {
//     projectId: v.id("project"),
//     environmentIds: v.array(v.id("environment")),
//   },
//   handler: async (
//     ctx: ProtectedMutationCtx,
//     args: { projectId: Id<"project">; environmentIds: Id<"environment">[] },
//   ) => {
//     const project = await ctx.db.get(args.projectId);
//
//     if (!project) {
//       throw new Error("Project not found");
//     }
//
//     if (project.isArchived) {
//       throw new Error("This project is archived. Unarchive it to access its data.");
//     }
//
//     await checkProjectOrganizationSuspended(ctx, project);
//
//     // NOTE: check if project is restricted for personal projects
//     const accessCheck = await isProjectAccessible(ctx, args.projectId);
//
//     if (!accessCheck.accessible) {
//       throw new Error(
//         "This project is restricted. Upgrade your plan or archive other projects to access it.",
//       );
//     }
//
//     if (!(await canAdminProject(ctx, project))) {
//       throw new Error("You do not have permission to reorder environments");
//     }
//
//     await checkRateLimit(ctx, "write");
//
//     for (const envId of args.environmentIds) {
//       const env = await ctx.db.get(envId);
//       if (!env || env.projectId !== args.projectId) {
//         throw new Error("Invalid environment ID or environment does not belong to this project");
//       }
//     }
//
//     const now = Date.now();
//     for (let i = 0; i < args.environmentIds.length; i++) {
//       const envId = args.environmentIds[i];
//       if (envId) {
//         await ctx.db.patch(envId, {
//           sortOrder: i,
//           updatedAt: now,
//         });
//       }
//     }
//
//     return { success: true };
//   },
// });
