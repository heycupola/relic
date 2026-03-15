import { v } from "convex/values";
import { doc } from "convex-helpers/validators";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import { assertProjectAccess, getUserProjectsWithRestrictions } from "./lib/access";
import {
  alreadyExistsError,
  createError,
  ErrorCode,
  limitReachedError,
  notFoundError,
} from "./lib/errors";
import { generateSlug } from "./lib/helpers";
import { createLogger } from "./lib/logger";
import { protectedAction, protectedMutation, protectedQuery } from "./lib/middleware";

const log = createLogger("project");

import { checkRateLimit } from "./lib/rateLimit";
import {
  ErrorSeverity,
  type ProtectedActionCtx,
  type ProtectedMutationCtx,
  type ProtectedQueryCtx,
} from "./lib/types";
import schema from "./schema";

export const getLimits = protectedAction({
  args: {},
  returns: v.object({
    usage: v.number(),
    includedUsage: v.number(),
  }),
  handler: async (ctx: ProtectedActionCtx) => {
    const result = await ctx.autumn.check(ctx, {
      featureId: "projects",
    });

    if (result.error || !result.data) {
      return {
        usage: 0,
        includedUsage: 0,
      };
    }

    return {
      usage: result.data.usage ?? 0,
      includedUsage: result.data.included_usage ?? 0,
    };
  },
});

export const getProjectLimits = protectedAction({
  args: {},
  handler: async (ctx: ProtectedActionCtx) => {
    const projectsFeature = await ctx.autumn.check(ctx, {
      featureId: "projects",
    });

    if (projectsFeature.error || !projectsFeature.data) {
      throw createError({
        code: ErrorCode.EXTERNAL_SERVICE_ERROR,
        message: "Projects feature info isn't reachable",
        severity: ErrorSeverity.High,
      });
    }

    const canShare = await ctx.autumn.check(ctx, {
      featureId: "can_share_project",
    });

    const hasPro = canShare.data?.allowed === true;

    if (
      !projectsFeature.data ||
      projectsFeature.data.usage === undefined ||
      projectsFeature.data.included_usage === undefined
    ) {
      throw createError({
        code: ErrorCode.EXTERNAL_SERVICE_ERROR,
        message: "Projects feature data is incomplete",
        severity: ErrorSeverity.High,
      });
    }

    const usage = projectsFeature.data.usage;
    const includedUsage = projectsFeature.data.included_usage;
    const balance = projectsFeature.data.balance;

    const freeLimit = includedUsage;
    const purchasedProjectsCount = Math.max(0, usage - freeLimit);
    const unusedProjects = balance;

    const effectiveLimit = Math.max(includedUsage, usage) + (balance ?? 0);

    return {
      hasPro,
      freeLimit,
      totalProjectsCount: usage,
      purchasedProjectsCount,
      unusedProjects,
      includedUsage: effectiveLimit,
    };
  },
});

export const createProject = protectedAction({
  args: {
    name: v.string(),
    // description: v.optional(v.string()),
    encryptedProjectKey: v.string(),
    confirmPayment: v.optional(v.boolean()),
  },
  returns: v.union(
    v.object({
      status: v.literal("success"),
      projectId: v.id("project"),
      message: v.optional(v.string()),
    }),
    v.object({
      status: v.literal("paymentFailed"),
      billingPortalUrl: v.union(v.string(), v.null()),
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
    v.object({
      status: v.literal("requiresRemoval"),
      currentUsage: v.number(),
      includedUsage: v.number(),
      excessCount: v.number(),
      message: v.optional(v.string()),
    }),
  ),
  handler: async (
    ctx: ProtectedActionCtx,
    args: { name: string; encryptedProjectKey: string; confirmPayment?: boolean },
  ) => {
    await checkRateLimit(ctx, "write");

    const { data, error } = await ctx.autumn.check(ctx, {
      featureId: "projects",
    });

    if (error || !data) {
      throw createError({
        code: ErrorCode.EXTERNAL_SERVICE_ERROR,
        message: "Pro plan info isn't reachable",
        severity: ErrorSeverity.High,
      });
    }

    if (data.usage === undefined || data.included_usage === undefined) {
      throw createError({
        code: ErrorCode.EXTERNAL_SERVICE_ERROR,
        message: "Projects feature data is incomplete",
        severity: ErrorSeverity.High,
      });
    }

    const currentUsage = data.usage;

    const canShare = await ctx.autumn.check(ctx, {
      featureId: "can_share_project",
    });

    const hasPro = canShare.data?.allowed === true;
    const freeLimit = data.included_usage;

    const isPaidProject = currentUsage >= freeLimit;

    if (isPaidProject) {
      if (!hasPro) {
        try {
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
            status: "requiresProPlan" as const,
            checkoutUrl: checkoutResult.data?.url || null,
            message: `Project limit reached (${currentUsage}/${data.included_usage}). Upgrade to Pro for more projects.`,
          };
        } catch (checkoutError) {
          log.error("Autumn checkout failed", { error: String(checkoutError) });
          return {
            status: "requiresProPlan" as const,
            checkoutUrl: null,
            message: `Project limit reached (${currentUsage}/${data.included_usage}). Upgrade to Pro for more projects.`,
          };
        }
      }

      const balance = data.balance;

      if (!args.confirmPayment) {
        if (!balance || balance <= 0) {
          return {
            status: "requiresConfirmation" as const,
            balance: 0,
            freeLimit,
            message: "No purchased projects available. Adding a project costs $10.",
          };
        }
        return {
          status: "requiresConfirmation" as const,
          balance,
          freeLimit,
          message: `This will use 1 of your ${balance} purchased projects.`,
        };
      }

      if (currentUsage > freeLimit) {
        const excessCount = currentUsage - freeLimit;
        return {
          status: "requiresRemoval" as const,
          currentUsage,
          includedUsage: freeLimit,
          excessCount,
          message: `You're using ${currentUsage} projects but only have ${freeLimit} included. Please archive ${excessCount} project(s) to continue.`,
        };
      }
    }

    const { projectId } = await ctx.runMutation(internal.project._insertProject, {
      name: args.name,
      createdBy: ctx.userId,
      ownerId: ctx.userId,
      encryptedProjectKey: args.encryptedProjectKey,
    });

    const pId: Id<"project"> = projectId;

    // Track usage: paid projects (for billing) or free projects within limit (for usage counting)
    if (isPaidProject || data.allowed) {
      try {
        await ctx.autumn.track(ctx, {
          featureId: "projects",
          value: 1,
        });
      } catch (trackError) {
        log.error("Payment tracking failed after project creation", {
          error: String(trackError),
        });
        if (isPaidProject) {
          // Compensate: delete the project we just created
          await ctx.runMutation(internal.project._deleteProject, { projectId: pId });

          // Get billing portal URL for user to fix payment
          let billingPortalUrl: string | null = null;
          try {
            const portalResult = await ctx.autumn.customers.billingPortal(ctx, {});
            billingPortalUrl = portalResult.data?.url || null;
          } catch (portalError) {
            log.error("Failed to get billing portal URL", { error: String(portalError) });
          }

          return {
            status: "paymentFailed" as const,
            billingPortalUrl,
            message: "Payment failed. Please update your billing settings.",
          };
        }
        // For free tier tracking failures, just log - don't fail the operation
      }
    }

    await ctx.runMutation(internal.actionLog._insertActionLog, {
      projectId: pId,
      projectName: args.name,
      userId: ctx.userId,
      action: "project.created",
    });

    log.info("Project created", { projectId: pId, userId: ctx.userId, isPaidProject });

    return { status: "success" as const, projectId: pId };
  },
});

export const listUserProjects = protectedQuery({
  args: {},
  handler: async (ctx: ProtectedQueryCtx) => {
    const { restrictedProjects, isInGracePeriod, gracePeriodDaysRemaining } =
      await getUserProjectsWithRestrictions(ctx);

    const allOwnedProjects = await ctx.db
      .query("project")
      .withIndex("by_owner", (q) => q.eq("ownerId", ctx.userId))
      .collect();

    const restrictedProjectIds = new Set(restrictedProjects.map((p) => p._id));

    const projects = allOwnedProjects.map((p) => {
      let status: "owned" | "archived" | "restricted";
      const isRestricted = restrictedProjectIds.has(p._id);

      if (p.isArchived) {
        status = "archived";
      } else if (isRestricted) {
        status = "restricted";
      } else {
        status = "owned";
      }

      return {
        id: p._id,
        name: p.name,
        slug: p.slug,
        description: p.description,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        isRestricted,
        isArchived: p.isArchived,
        status,
        ownerId: p.ownerId,
        shareUsageCount: p.shareUsageCount,
      };
    });

    return {
      projects,
      isInGracePeriod,
      gracePeriodDaysRemaining: isInGracePeriod ? gracePeriodDaysRemaining : undefined,
    };
  },
});

export const getProject = protectedQuery({
  args: {
    projectId: v.id("project"),
  },
  handler: async (ctx: ProtectedQueryCtx, args: { projectId: Id<"project"> }) => {
    const project: Doc<"project"> = await ctx.runQuery(internal.project._loadProjectById, {
      projectId: args.projectId,
    });

    await assertProjectAccess(ctx, project);

    return {
      id: project._id,
      name: project.name,
      slug: project.slug,
      description: project.description,
      ownerId: project.ownerId,
      isArchived: project.isArchived,
      keyVersion: project.keyVersion,
      encryptedProjectKey: project.encryptedProjectKey,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    };
  },
});

export const updateProject = protectedMutation({
  args: {
    projectId: v.id("project"),
    name: v.optional(v.string()),
    // description: v.optional(v.string()),
  },
  handler: async (ctx: ProtectedMutationCtx, args: { projectId: Id<"project">; name?: string }) => {
    const project: Doc<"project"> = await ctx.runQuery(internal.project._loadProjectById, {
      projectId: args.projectId,
    });

    // Owner-only operation
    if (ctx.userId !== project.ownerId) {
      throw createError({
        code: ErrorCode.INSUFFICIENT_PERMISSION,
        message: "Only the project owner can update project settings",
        severity: ErrorSeverity.High,
      });
    }

    await assertProjectAccess(ctx, project);

    await checkRateLimit(ctx, "write");

    await ctx.runMutation(internal.project._updateProject, {
      projectId: args.projectId,
      updates: {
        name: args.name,
      },
    });

    await ctx.runMutation(internal.actionLog._insertActionLog, {
      projectId: args.projectId,
      projectName: args.name ?? project.name,
      userId: ctx.userId,
      action: "project.updated",
    });

    return { success: true };
  },
});

export const archiveProject = protectedAction({
  args: {
    projectId: v.id("project"),
  },
  handler: async (ctx: ProtectedActionCtx, args: { projectId: Id<"project"> }) => {
    const project: Doc<"project"> = await ctx.runQuery(internal.project._loadProjectById, {
      projectId: args.projectId,
    });

    // Owner-only operation
    if (ctx.userId !== project.ownerId) {
      throw createError({
        code: ErrorCode.INSUFFICIENT_PERMISSION,
        message: "Only the project owner can archive projects",
        severity: ErrorSeverity.High,
      });
    }

    await assertProjectAccess(ctx, project);

    await checkRateLimit(ctx, "write");

    const activeShares = await ctx.runQuery(internal.projectShare._loadActiveSharesByProject, {
      projectId: args.projectId,
    });

    if (activeShares.length > 0) {
      throw createError({
        code: ErrorCode.INVALID_OPERATION,
        message: `Cannot archive project with ${activeShares.length} active share(s). Revoke all shares first.`,
        severity: ErrorSeverity.Medium,
      });
    }

    await ctx.runMutation(internal.project._archiveProject, {
      projectId: args.projectId,
    });

    await ctx.autumn.track(ctx, {
      featureId: "projects",
      value: -1,
    });

    await ctx.runMutation(internal.actionLog._insertActionLog, {
      projectId: args.projectId,
      projectName: project.name,
      userId: ctx.userId,
      action: "project.archived",
    });

    log.info("Project archived", { projectId: args.projectId, userId: ctx.userId });

    return { success: true };
  },
});

export const unarchiveProject = protectedAction({
  args: {
    projectId: v.id("project"),
  },
  handler: async (ctx: ProtectedActionCtx, args: { projectId: Id<"project"> }) => {
    const project: Doc<"project"> = await ctx.runQuery(internal.project._loadProjectById, {
      projectId: args.projectId,
    });

    // Owner-only operation
    if (ctx.userId !== project.ownerId) {
      throw createError({
        code: ErrorCode.INSUFFICIENT_PERMISSION,
        message: "Only the project owner can unarchive projects",
        severity: ErrorSeverity.High,
      });
    }

    await assertProjectAccess(ctx, project, { skipArchivedCheck: true });

    await checkRateLimit(ctx, "write");

    await ctx.runMutation(internal.project._unarchiveProject, {
      projectId: args.projectId,
    });

    const { data, error } = await ctx.autumn.check(ctx, {
      featureId: "projects",
    });

    if (error || !data) {
      throw createError({
        code: ErrorCode.EXTERNAL_SERVICE_ERROR,
        message: "Personal projects are inaccessible",
        severity: ErrorSeverity.High,
      });
    }

    if (!data.allowed) {
      throw limitReachedError("projects", data.usage, data.included_usage, ErrorSeverity.High);
    }

    await ctx.autumn.track(ctx, {
      featureId: "projects",
      value: 1,
    });

    await ctx.runMutation(internal.actionLog._insertActionLog, {
      projectId: args.projectId,
      projectName: project.name,
      userId: ctx.userId,
      action: "project.unarchived",
    });

    log.info("Project unarchived", { projectId: args.projectId, userId: ctx.userId });

    return { success: true };
  },
});

export const _loadProjectById = internalQuery({
  args: {
    projectId: v.id("project"),
  },
  returns: doc(schema, "project"),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);

    if (!project) {
      throw notFoundError("project");
    }

    return project;
  },
});

export const _loadActiveProjectsByOwner = internalQuery({
  args: {
    ownerId: v.string(),
  },
  returns: v.array(doc(schema, "project")),
  handler: async (ctx, args) => {
    const projects = await ctx.db
      .query("project")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId))
      .filter((q) => q.eq(q.field("isArchived"), false))
      .collect();

    return projects;
  },
});

export const _loadAllProjectsByOwner = internalQuery({
  args: {
    ownerId: v.string(),
  },
  returns: v.array(doc(schema, "project")),
  handler: async (ctx, args) => {
    const projects = await ctx.db
      .query("project")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId))
      .collect();

    return projects;
  },
});

export const _insertProject = internalMutation({
  args: {
    name: v.string(),
    // description: v.optional(v.string()),
    ownerId: v.string(),
    encryptedProjectKey: v.string(),
    createdBy: v.string(),
  },
  returns: v.object({ success: v.boolean(), projectId: v.id("project") }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const slug = generateSlug(args.name);

    const existingProjects = await ctx.db
      .query("project")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId))
      .filter((q) => q.eq(q.field("isArchived"), false))
      .filter((q) => q.eq(q.field("slug"), slug))
      .collect();

    if (existingProjects.length > 0) {
      throw alreadyExistsError("project", ErrorSeverity.Medium);
    }

    const projectId = await ctx.db.insert("project", {
      name: args.name,
      slug,
      // description: args.description,
      ownerId: args.ownerId,
      encryptedProjectKey: args.encryptedProjectKey,
      keyVersion: 1,
      shareUsageCount: 0,
      isArchived: false,
      createdAt: now,
      updatedAt: now,
    });

    return { success: true, projectId };
  },
});

export const _updateProject = internalMutation({
  args: {
    projectId: v.id("project"),
    updates: v.object({
      name: v.optional(v.string()),
      // description: v.string(),
    }),
  },
  returns: v.object({
    success: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const updates: {
      updatedAt: number;
      name?: string;
      slug?: string;
      description?: string;
    } = { updatedAt: Date.now() };
    if (args.updates.name !== undefined) {
      updates.name = args.updates.name;
      updates.slug = generateSlug(args.updates.name);
      // if (args.description !== undefined) updates.description = args.description;
    }

    await ctx.db.patch(args.projectId, updates);

    return { success: true };
  },
});

export const _archiveProject = internalMutation({
  args: {
    projectId: v.id("project"),
  },
  returns: v.object({
    success: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.projectId, { isArchived: true, updatedAt: Date.now() });

    return { success: true };
  },
});

export const _unarchiveProject = internalMutation({
  args: {
    projectId: v.id("project"),
  },
  returns: v.object({
    success: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.projectId, { isArchived: false, updatedAt: Date.now() });

    return { success: true };
  },
});

// NOTE: This is a HARD DELETE used only as a compensating action when payment
// tracking fails after project creation. Unlike archiveProject (soft delete that
// sets isArchived=true and preserves the record), this permanently removes the
// project from the database to maintain atomicity - either the project AND
// payment succeed together, or neither exists.
export const _deleteProject = internalMutation({
  args: {
    projectId: v.id("project"),
  },
  returns: v.object({
    success: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await ctx.db.delete(args.projectId);
    return { success: true };
  },
});

export const _rotateProjectKey = internalMutation({
  args: {
    projectId: v.id("project"),
    newEncryptedProjectKey: v.string(),
    newKeyVersion: v.number(),
  },
  returns: v.object({
    success: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.projectId, {
      encryptedProjectKey: args.newEncryptedProjectKey,
      keyVersion: args.newKeyVersion,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});
