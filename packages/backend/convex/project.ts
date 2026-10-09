import { type Infer, v } from "convex/values";
import { doc } from "convex-helpers/validators";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internalMutation, internalQuery } from "./_generated/server";
import { requestUsageSync, toBillingCustomer } from "./billing";
import { assertProjectAccess, assertProjectOwner } from "./lib/access";
import { autumnApi } from "./lib/autumn";
import {
  findActiveShare,
  getProjectOrThrow,
  insertActionLog,
  listActiveOwnedProjects,
  listActiveSharesByProject,
  loadUser,
} from "./lib/data";
import { alreadyExistsError, createError, ErrorCode, limitReachedError } from "./lib/errors";
import { generateSlug } from "./lib/helpers";
import { createLogger } from "./lib/logger";
import { protectedAction, protectedMutation, protectedQuery } from "./lib/middleware";
import { ADD_ON_PRICES_USD, getAccessibleProjectIds, getPlanState } from "./lib/plans";
import { checkRateLimit } from "./lib/rateLimit";
import { ErrorSeverity, type ProtectedActionCtx } from "./lib/types";
import schema from "./schema";

const log = createLogger("project");

const projectLimitsValidator = v.object({
  hasPro: v.boolean(),
  freeLimit: v.number(),
  totalProjectsCount: v.number(),
  purchasedProjectsCount: v.number(),
  unusedProjects: v.number(),
  includedUsage: v.number(),
});

export const _getProjectLimits = internalQuery({
  args: { userId: v.string() },
  returns: projectLimitsValidator,
  handler: async (ctx, { userId }) => {
    const user = await loadUser(ctx, userId);
    const { isPro, limits } = getPlanState(user);
    const count = (await listActiveOwnedProjects(ctx, userId)).length;
    const included = limits.includedProjects;

    return {
      hasPro: isPro,
      freeLimit: included,
      totalProjectsCount: count,
      purchasedProjectsCount: isPro ? Math.max(0, count - included) : 0,
      unusedProjects: Math.max(0, included - count),
      includedUsage: Math.max(included, count),
    };
  },
});

export const getLimits = protectedAction({
  args: {},
  returns: v.object({ usage: v.number(), includedUsage: v.number() }),
  handler: async (ctx): Promise<{ usage: number; includedUsage: number }> => {
    const limits = await ctx.runQuery(internal.project._getProjectLimits, { userId: ctx.userId });
    return { usage: limits.totalProjectsCount, includedUsage: limits.freeLimit };
  },
});

export const getProjectLimits = protectedAction({
  args: {},
  returns: projectLimitsValidator,
  handler: async (ctx): Promise<Infer<typeof projectLimitsValidator>> => {
    return await ctx.runQuery(internal.project._getProjectLimits, { userId: ctx.userId });
  },
});

const createProjectResult = v.union(
  v.object({
    status: v.literal("success"),
    projectId: v.id("project"),
    message: v.optional(v.string()),
  }),
  v.object({
    status: v.literal("requiresProPlan"),
    checkoutUrl: v.union(v.string(), v.null()),
    message: v.optional(v.string()),
  }),
  v.object({
    status: v.literal("requiresConfirmation"),
    balance: v.number(),
    freeLimit: v.number(),
    message: v.optional(v.string()),
  }),
);

async function assertUniqueSlug(
  ctx: Pick<MutationCtx, "db">,
  ownerId: string,
  slug: string,
  exceptId?: Id<"project">,
) {
  const clash = await ctx.db
    .query("project")
    .withIndex("by_owner_slug", (q) => q.eq("ownerId", ownerId).eq("slug", slug))
    .filter((q) => q.eq(q.field("isArchived"), false))
    .first();

  if (clash && clash._id !== exceptId) {
    alreadyExistsError("project", ErrorSeverity.Medium);
  }
}

function validateProjectName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    createError({
      code: ErrorCode.INVALID_ARGUMENTS,
      message: "Project name is required",
      severity: ErrorSeverity.Low,
    });
  }
  return trimmed;
}

type CreateProjectGateResult =
  | { status: "success"; projectId: Id<"project"> }
  | { status: "requiresProPlan"; message: string }
  | { status: "requiresConfirmation"; balance: number; freeLimit: number; message: string };

export const _createProject = internalMutation({
  args: {
    ownerId: v.string(),
    name: v.string(),
    encryptedProjectKey: v.string(),
    confirmPayment: v.boolean(),
  },
  handler: async (ctx, args): Promise<CreateProjectGateResult> => {
    const name = validateProjectName(args.name);
    const user = await loadUser(ctx, args.ownerId);
    const { isPro, limits } = getPlanState(user);
    const count = (await listActiveOwnedProjects(ctx, args.ownerId)).length;
    const isPaidProject = count >= limits.includedProjects;

    if (isPaidProject && !isPro) {
      return {
        status: "requiresProPlan" as const,
        message: `Project limit reached (${count}/${limits.includedProjects}). Upgrade to Pro for more projects.`,
      };
    }

    if (isPaidProject && !args.confirmPayment) {
      return {
        status: "requiresConfirmation" as const,
        balance: 0,
        freeLimit: limits.includedProjects,
        message: `Adding a project costs $${ADD_ON_PRICES_USD.project}/month.`,
      };
    }

    const slug = generateSlug(name);
    await assertUniqueSlug(ctx, args.ownerId, slug);

    const now = Date.now();
    const projectId = await ctx.db.insert("project", {
      name,
      slug,
      ownerId: args.ownerId,
      encryptedProjectKey: args.encryptedProjectKey,
      keyVersion: 1,
      shareUsageCount: 0,
      isArchived: false,
      createdAt: now,
      updatedAt: now,
    });

    await insertActionLog(ctx, {
      projectId,
      projectName: name,
      userId: args.ownerId,
      action: "project.created",
    });
    await requestUsageSync(ctx, args.ownerId);

    log.info("Project created", { projectId, userId: args.ownerId, isPaidProject });
    return { status: "success" as const, projectId };
  },
});

export const createProject = protectedAction({
  args: {
    name: v.string(),
    encryptedProjectKey: v.string(),
    confirmPayment: v.optional(v.boolean()),
  },
  returns: createProjectResult,
  handler: async (ctx, args): Promise<Infer<typeof createProjectResult>> => {
    await checkRateLimit(ctx, "write");

    const result: CreateProjectGateResult = await ctx.runMutation(internal.project._createProject, {
      ownerId: ctx.userId,
      name: args.name,
      encryptedProjectKey: args.encryptedProjectKey,
      confirmPayment: args.confirmPayment ?? false,
    });

    if (result.status !== "requiresProPlan") return result;

    return { ...result, checkoutUrl: await createCheckoutUrlSafely(ctx) };
  },
});

export async function createCheckoutUrlSafely(ctx: ProtectedActionCtx): Promise<string | null> {
  try {
    return await autumnApi.createProCheckoutUrl(
      toBillingCustomer({ _id: ctx.userId, name: ctx.name ?? "", email: ctx.email ?? "" }),
    );
  } catch (error) {
    log.error("Failed to create checkout URL", { error: String(error) });
    return null;
  }
}

export const listUserProjects = protectedQuery({
  args: {},
  handler: async (ctx) => {
    const user = await loadUser(ctx, ctx.userId);
    const state = getPlanState(user);

    const projects = await ctx.db
      .query("project")
      .withIndex("by_owner", (q) => q.eq("ownerId", ctx.userId))
      .collect();

    const accessible = getAccessibleProjectIds(
      projects.filter((p) => !p.isArchived),
      state,
    );

    return {
      projects: projects.map((p) => {
        const isRestricted = !p.isArchived && !accessible.has(p._id);
        return {
          id: p._id,
          name: p.name,
          slug: p.slug,
          description: p.description,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
          isRestricted,
          isArchived: p.isArchived,
          status: p.isArchived
            ? ("archived" as const)
            : isRestricted
              ? ("restricted" as const)
              : ("owned" as const),
          ownerId: p.ownerId,
          shareUsageCount: p.shareUsageCount,
        };
      }),
      isInGracePeriod: state.inGracePeriod,
      gracePeriodDaysRemaining: state.inGracePeriod ? state.gracePeriodDaysRemaining : undefined,
    };
  },
});

export const getProject = protectedQuery({
  args: { projectId: v.id("project") },
  handler: async (ctx, args) => {
    const project = await getProjectOrThrow(ctx, args.projectId);
    await assertProjectAccess(ctx, project);

    // Each member gets the project key wrapped for their own RSA key; the owner's copy is useless to others.
    let encryptedProjectKey = project.encryptedProjectKey;
    if (project.ownerId !== ctx.userId) {
      const share = await findActiveShare(ctx, project._id, ctx.userId);
      if (share) encryptedProjectKey = share.encryptedProjectKey;
    }

    return {
      id: project._id,
      name: project.name,
      slug: project.slug,
      description: project.description,
      ownerId: project.ownerId,
      isArchived: project.isArchived,
      keyVersion: project.keyVersion,
      encryptedProjectKey,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    };
  },
});

export const updateProject = protectedMutation({
  args: {
    projectId: v.id("project"),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const project = await getProjectOrThrow(ctx, args.projectId);
    assertProjectOwner(ctx, project, "update project settings");
    await assertProjectAccess(ctx, project);
    await checkRateLimit(ctx, "write");

    if (args.name !== undefined) {
      const name = validateProjectName(args.name);
      const slug = generateSlug(name);
      await assertUniqueSlug(ctx, project.ownerId, slug, project._id);
      await ctx.db.patch(project._id, { name, slug, updatedAt: Date.now() });
    }

    await insertActionLog(ctx, {
      projectId: project._id,
      projectName: args.name?.trim() ?? project.name,
      userId: ctx.userId,
      action: "project.updated",
    });

    return { success: true };
  },
});

const unarchiveProjectResult = v.union(
  v.object({ status: v.literal("success") }),
  v.object({
    status: v.literal("requiresConfirmation"),
    balance: v.number(),
    freeLimit: v.number(),
    message: v.optional(v.string()),
  }),
);

type SetArchivedResult = Infer<typeof unarchiveProjectResult>;

export const _setArchived = internalMutation({
  args: {
    userId: v.string(),
    projectId: v.id("project"),
    archived: v.boolean(),
    confirmPayment: v.optional(v.boolean()),
  },
  returns: unarchiveProjectResult,
  handler: async (
    ctx,
    { userId, projectId, archived, confirmPayment },
  ): Promise<SetArchivedResult> => {
    const project = await getProjectOrThrow(ctx, projectId);
    const actor = { ...ctx, userId };
    const verb = archived ? "archive projects" : "unarchive projects";

    assertProjectOwner(actor, project, verb);
    await assertProjectAccess(actor, project, { skipArchivedCheck: !archived });

    if (project.isArchived === archived) {
      createError({
        code: ErrorCode.INVALID_OPERATION,
        message: archived ? "Project is already archived" : "Project is not archived",
        severity: ErrorSeverity.Medium,
      });
    }

    if (archived) {
      const shares = await listActiveSharesByProject(ctx, projectId);
      if (shares.length > 0) {
        createError({
          code: ErrorCode.INVALID_OPERATION,
          message: `Cannot archive project with ${shares.length} active share(s). Revoke all shares first.`,
          severity: ErrorSeverity.Medium,
        });
      }

      const serviceAccounts = await ctx.db
        .query("serviceAccount")
        .withIndex("by_project_revoked", (q) =>
          q.eq("projectId", projectId).eq("revokedAt", undefined),
        )
        .collect();
      if (serviceAccounts.length > 0) {
        createError({
          code: ErrorCode.INVALID_OPERATION,
          message: `Cannot archive project with ${serviceAccounts.length} active service account(s). Revoke all service accounts first.`,
          severity: ErrorSeverity.Medium,
        });
      }
    } else {
      const user = await loadUser(ctx, userId);
      const { isPro, limits } = getPlanState(user);
      const count = (await listActiveOwnedProjects(ctx, userId)).length;
      const isPaidProject = count >= limits.includedProjects;
      if (isPaidProject && !isPro) {
        limitReachedError("projects", count, limits.includedProjects, ErrorSeverity.High);
      }
      await assertUniqueSlug(ctx, userId, project.slug, projectId);

      if (isPaidProject && confirmPayment !== true) {
        return {
          status: "requiresConfirmation" as const,
          balance: 0,
          freeLimit: limits.includedProjects,
          message: `Unarchiving this project adds a paid project ($${ADD_ON_PRICES_USD.project}/month). Confirm to proceed.`,
        };
      }
    }

    await ctx.db.patch(projectId, { isArchived: archived, updatedAt: Date.now() });
    await insertActionLog(ctx, {
      projectId,
      projectName: project.name,
      userId,
      action: archived ? "project.archived" : "project.unarchived",
    });
    await requestUsageSync(ctx, userId);

    log.info(archived ? "Project archived" : "Project unarchived", { projectId, userId });
    return { status: "success" as const };
  },
});

export const archiveProject = protectedAction({
  args: { projectId: v.id("project") },
  handler: async (ctx, { projectId }): Promise<{ success: boolean }> => {
    await checkRateLimit(ctx, "write");
    await ctx.runMutation(internal.project._setArchived, {
      userId: ctx.userId,
      projectId,
      archived: true,
    });
    return { success: true };
  },
});

export const unarchiveProject = protectedAction({
  args: { projectId: v.id("project"), confirmPayment: v.optional(v.boolean()) },
  returns: unarchiveProjectResult,
  handler: async (ctx, { projectId, confirmPayment }): Promise<SetArchivedResult> => {
    await checkRateLimit(ctx, "write");
    return await ctx.runMutation(internal.project._setArchived, {
      userId: ctx.userId,
      projectId,
      archived: false,
      confirmPayment,
    });
  },
});

export const _loadProjectById = internalQuery({
  args: { projectId: v.id("project") },
  returns: doc(schema, "project"),
  handler: async (ctx, args): Promise<Doc<"project">> => getProjectOrThrow(ctx, args.projectId),
});

export const _loadActiveProjectsByOwner = internalQuery({
  args: { ownerId: v.string() },
  returns: v.array(doc(schema, "project")),
  handler: async (ctx, args) => listActiveOwnedProjects(ctx, args.ownerId),
});

export const _rotateProjectKey = internalMutation({
  args: {
    projectId: v.id("project"),
    newEncryptedProjectKey: v.string(),
    newKeyVersion: v.number(),
  },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.projectId, {
      encryptedProjectKey: args.newEncryptedProjectKey,
      keyVersion: args.newKeyVersion,
      updatedAt: Date.now(),
    });
    return { success: true };
  },
});
