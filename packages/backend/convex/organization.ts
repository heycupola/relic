import { ConvexError, v } from "convex/values";
import { components, internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import type { Doc as BetterAuthDoc, Id as BetterAuthId } from "./betterAuth/_generated/dataModel";
import { OrgRole, OrgSubscriptionStatus } from "./betterAuth/lib/types";
import { isOrganizationAccessible } from "./lib/access";
import { protectedAction, protectedMutation, protectedQuery } from "./lib/middleware";
import { checkRateLimit } from "./lib/rateLimit";
import {
  ErrorSeverity,
  type ProtectedActionCtx,
  type ProtectedMutationCtx,
  type ProtectedQueryCtx,
  RotationReason,
} from "./lib/types";

export const createOrganization = protectedAction({
  args: {
    name: v.string(),
    wrappedOrgKey: v.string(),
  },
  handler: async (ctx: ProtectedActionCtx, args) => {
    const user = await ctx.runQuery(components.betterAuth.user.loadUserById, {
      userId: ctx.userId,
    });

    const { data, error } = await ctx.autumn.check(ctx, {
      featureId: "can_create_org",
    });

    if (!data || error || data.allowed === false) {
      throw new ConvexError({
        code: "CANNOT_CREATE_ORG",
        message: "Unable to create org",
        severity: ErrorSeverity.Medium,
      });
    }

    await checkRateLimit(ctx, "write");

    let canUseFreeOrg = false;

    if (!user.freeOrganizationUsed) {
      const freeOrgCheck = await ctx.autumn.check(ctx, {
        featureId: "free_org",
      });

      if (freeOrgCheck.data?.allowed) {
        canUseFreeOrg = true;
      }
    }

    const { organizationId, slug, subscriptionStatus, paymentExpiresAt } = await ctx.runMutation(
      components.betterAuth.organization.createOrganization,
      {
        isFreeWithProPlan: canUseFreeOrg,
        name: args.name,
        ownerId: ctx.userId,
        wrappedOrgKey: args.wrappedOrgKey,
      },
    );

    await ctx.autumn.track(ctx, {
      entityId: organizationId,
      featureId: "members",
      value: 1,
    });

    if (canUseFreeOrg) {
      await ctx.autumn.track(ctx, {
        featureId: "free_org",
        value: 1,
      });

      await ctx.runMutation(components.betterAuth.user.useFreeOrg, {
        userId: ctx.userId,
      });

      return {
        success: true,
        status: subscriptionStatus,
        organizationId,
        name: args.name,
        slug,
        isFreeWithProPlan: canUseFreeOrg,
        expiresAt: null,
        checkoutUrl: null,
        message: null,
      };
    } else {
      const checkoutResult = await ctx.autumn.checkout(ctx, {
        productId: "org_plan",
        entityId: organizationId,
        successUrl: `${process.env.SITE_URL}/org/${organizationId}/success?session_id={CHECKOUT_SESSION_ID}`,
        customerData: {
          name: user.name || undefined,
          email: user.email,
        },
        checkoutSessionParams: {
          cancel_url: `${process.env.SITE_URL}/org/${organizationId}/cancel`,
          metadata: {
            organizationId,
            userId: ctx.userId,
            organizationName: args.name,
          },
        },
      });

      if (checkoutResult.error || !checkoutResult.data) {
        throw new ConvexError({
          code: "CHECKOUT_FAILED",
          message: `Failed to create checkout session: ${checkoutResult.error?.message || "Unknown error"}`,
          severity: "high" as const,
        });
      }

      return {
        success: true,
        status: subscriptionStatus,
        organizationId,
        name: args.name,
        slug,
        isFreeWithProPlan: canUseFreeOrg,
        expiresAt: paymentExpiresAt ?? null,
        checkoutUrl: checkoutResult.data.url,
        message: "Complete payment within 1 hour or organization will be deleted",
      };
    }
  },
});

export const inviteMember = protectedAction({
  args: {
    organizationId: v.string(),
    email: v.string(),
    role: v.union(v.literal("admin"), v.literal("member"), v.literal("viewer")),
    wrappedOrgKey: v.string(),
  },
  handler: async (
    ctx: ProtectedActionCtx,
    args: {
      organizationId: string;
      email: string;
      role: OrgRole.Admin | OrgRole.Member | OrgRole.Viewer;
      wrappedOrgKey: string;
    },
  ) => {
    const organization = await ctx.runQuery(
      components.betterAuth.organization.loadOrganizationById,
      { organizationId: args.organizationId },
    );

    if (!organization) {
      throw new ConvexError({
        code: "ORGANIZATION_NOT_FOUND",
        message: "Organization doesn't exist",
        severity: ErrorSeverity.High,
      });
    }

    const { accessible, message } = await isOrganizationAccessible(
      organization as BetterAuthDoc<"organization">,
    );

    if (!accessible) {
      throw new ConvexError({
        code: "ORGANIZATION_NOT_ACCESSIBLE",
        message,
        severity: ErrorSeverity.High,
      });
    }

    const { data, error } = await ctx.autumn.check(ctx, {
      entityId: args.organizationId,
      featureId: "members",
    });

    if (error || !data) {
      throw new ConvexError({
        code: "MEMBER_DATA_INACCESSIBLE",
        message: "Unable to access member data",
        severity: ErrorSeverity.High,
      });
    }

    const limit = data.included_usage;
    const currentUsage = data.usage;

    if (limit === undefined || currentUsage === undefined) {
      throw new ConvexError({
        code: "NO_MEMBER_DATA_FOUND",
        message: "Members were not found",
        severity: ErrorSeverity.High,
      });
    }

    if (currentUsage >= limit) {
      throw new ConvexError({
        code: "MEMBER_LIMIT_REACHED",
        message: `Organization member limit reached (${currentUsage}/${limit}). Please add more seats.`,
        severity: ErrorSeverity.High,
      });
    }

    await checkRateLimit(ctx, "write", args.organizationId);

    const { role } = await ctx.runQuery(components.betterAuth.member.getMemberRole, {
      organizationId: args.organizationId,
      userId: ctx.userId,
    });

    if (!role) {
      throw new ConvexError({
        code: "INVITER_HAS_NO_ROLE",
        message: "You are not part of this organization",
        severity: ErrorSeverity.High,
      });
    }

    // NOTE: Permission validation (owner/admin only) is handled by Better-Auth's inviteMember
    await ctx.runMutation(components.betterAuth.invitation.inviteMember, {
      email: args.email,
      inviterId: ctx.userId,
      inviterRole: role,
      organizationId: args.organizationId,
      role: args.role,
      wrappedOrgKey: args.wrappedOrgKey,
    });

    return { success: true };
  },
});

export const removeMember = protectedAction({
  args: {
    organizationId: v.id("organization"),
    userId: v.id("user"),
  },
  handler: async (
    ctx: ProtectedActionCtx,
    args: {
      organizationId: BetterAuthId<"organization">;
      userId: BetterAuthId<"user">;
    },
  ) => {
    const organization = await ctx.runQuery(
      components.betterAuth.organization.loadOrganizationById,
      { organizationId: args.organizationId },
    );

    if (!organization) {
      throw new ConvexError({
        code: "ORGANIZATION_NOT_FOUND",
        message: "Organization doesn't exist",
        severity: ErrorSeverity.High,
      });
    }

    const { accessible, message } = await isOrganizationAccessible(
      organization as BetterAuthDoc<"organization">,
    );

    if (!accessible) {
      throw new ConvexError({
        code: "ORGANIZATION_NOT_ACCESSIBLE",
        message,
        severity: ErrorSeverity.High,
      });
    }

    await checkRateLimit(ctx, "write", args.organizationId);

    await ctx.runMutation(components.betterAuth.member.removeMember, {
      fromId: ctx.userId,
      toId: args.userId,
      organizationId: args.organizationId,
    });

    await ctx.autumn.track(ctx, {
      entityId: args.organizationId,
      featureId: "members",
      value: -1,
    });

    return {
      success: true,
    };
  },
});

export const leaveOrganization = protectedAction({
  args: {
    organizationId: v.id("organization"),
  },
  handler: async (ctx, args) => {
    const organization = await ctx.runQuery(
      components.betterAuth.organization.loadOrganizationById,
      { organizationId: args.organizationId },
    );

    if (!organization) {
      throw new ConvexError({
        code: "ORGANIZATION_NOT_FOUND",
        message: "Organization doesn't exist",
        severity: ErrorSeverity.High,
      });
    }

    const { accessible, message } = await isOrganizationAccessible(
      organization as BetterAuthDoc<"organization">,
    );

    if (!accessible) {
      throw new ConvexError({
        code: "ORGANIZATION_NOT_ACCESSIBLE",
        message,
        severity: ErrorSeverity.High,
      });
    }

    await checkRateLimit(ctx, "write", args.organizationId);

    await ctx.runMutation(components.betterAuth.member.leaveOrganization, {
      organizationId: args.organizationId,
      userId: ctx.userId,
    });

    await ctx.autumn.track(ctx, {
      entityId: args.organizationId,
      featureId: "members",
      value: -1,
    });

    return {
      success: true,
    };
  },
});

export const listOrganizationMembers = protectedQuery({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx: ProtectedQueryCtx, args: { organizationId: string }) => {
    await checkRateLimit(ctx, "read");

    const organization = await ctx.runQuery(
      components.betterAuth.organization.loadOrganizationById,
      { organizationId: args.organizationId },
    );

    if (!organization) {
      throw new ConvexError({
        code: "ORGANIZATION_NOT_FOUND",
        message: "Organization doesn't exist",
        severity: ErrorSeverity.High,
      });
    }

    const { accessible, message } = await isOrganizationAccessible(
      organization as BetterAuthDoc<"organization">,
    );

    if (!accessible) {
      throw new ConvexError({
        code: "ORGANIZATION_NOT_ACCESSIBLE",
        message,
        severity: ErrorSeverity.High,
      });
    }

    const { isOrganizationMember } = await ctx.runQuery(
      components.betterAuth.member.isOrganizationMember,
      {
        userId: ctx.userId,
        organizationId: args.organizationId,
      },
    );

    if (!isOrganizationMember) {
      throw new ConvexError({
        code: "INSUFFICIENT_AUTHORIZATION",
        message: "You are not the member of the organization of the project",
        severity: ErrorSeverity.High,
      });
    }

    const members = await ctx.runQuery(components.betterAuth.member.getOrganizationMembers, {
      orgId: args.organizationId,
    });

    return members;
  },
});

export const loadOrganizationsByUserId = protectedQuery({
  args: {
    userId: v.id("user"),
  },
  handler: async (ctx: ProtectedQueryCtx, args) => {
    const { organizations } = await ctx.runQuery(
      components.betterAuth.organization.loadOrganizationsByUserId,
      {
        userId: args.userId,
      },
    );

    return organizations;
  },
});

export const rotateKeys = protectedMutation({
  args: {
    organizationId: v.string(),
    newKeyVersion: v.number(),
    secrets: v.array(
      v.object({
        secretId: v.id("secret"),
        encryptedValue: v.string(),
      }),
    ),
    wrappedOrgKeys: v.array(v.string()),
    memberIds: v.array(v.id("member")),
    reason: v.union(
      v.literal(RotationReason.Manual),
      v.literal(RotationReason.MemberRemoved),
      v.literal(RotationReason.Scheduled),
    ),
  },
  handler: async (
    ctx: ProtectedMutationCtx,
    args,
  ): Promise<{
    success: boolean;
    newKeyVersion: number;
    secretsReEncrypted: number;
    membersRewrapped: number;
  }> => {
    const organization = await ctx.runQuery(
      components.betterAuth.organization.loadOrganizationById,
      { organizationId: args.organizationId },
    );

    if (!organization) {
      throw new ConvexError({
        code: "ORGANIZATION_NOT_FOUND",
        message: "Organization doesn't exist",
        severity: ErrorSeverity.High,
      });
    }

    const { accessible, message } = await isOrganizationAccessible(
      organization as BetterAuthDoc<"organization">,
    );

    if (!accessible) {
      throw new ConvexError({
        code: "ORGANIZATION_NOT_ACCESSIBLE",
        message,
        severity: ErrorSeverity.High,
      });
    }

    const { role: requesterRole } = await ctx.runQuery(components.betterAuth.member.getMemberRole, {
      organizationId: args.organizationId,
      userId: ctx.userId,
    });

    if (!requesterRole || (requesterRole as OrgRole) !== OrgRole.Owner) {
      throw new ConvexError({
        code: "INSUFFICIENT_ROLE",
        message: "Only organization owners can rotate keys",
        severity: ErrorSeverity.High,
      });
    }

    if (args.newKeyVersion !== organization.currentKeyVersion + 1) {
      throw new ConvexError({
        code: "WRONG_KEY_VERSION",
        message: `Invalid key version. Expected ${organization.currentKeyVersion + 1}, got ${args.newKeyVersion}`,
        severity: ErrorSeverity.High,
      });
    }

    await checkRateLimit(ctx, "keyRotation", args.organizationId);

    const { newKeyVersion, membersRewrapped, secretsReEncrypted, success } = await ctx.runMutation(
      internal.organization._rotateAllKeys,
      {
        newKeyVersion: args.newKeyVersion,
        organizationId: args.organizationId as BetterAuthId<"organization">,
        secrets: args.secrets,
        wrappedOrgKeys: args.wrappedOrgKeys,
        memberIds: args.memberIds,
        reason: args.reason,
        userId: ctx.userId,
      },
    );

    return {
      success,
      newKeyVersion,
      secretsReEncrypted,
      membersRewrapped,
    };
  },
});

export const _rotateAllKeys = internalMutation({
  args: {
    newKeyVersion: v.number(),
    organizationId: v.id("organization"),
    secrets: v.array(
      v.object({
        secretId: v.id("secret"),
        encryptedValue: v.string(),
      }),
    ),
    wrappedOrgKeys: v.array(v.string()),
    memberIds: v.array(v.id("member")),
    reason: v.union(
      v.literal(RotationReason.Manual),
      v.literal(RotationReason.MemberRemoved),
      v.literal(RotationReason.Scheduled),
    ),
    userId: v.id("user"),
  },
  returns: v.object({
    success: v.boolean(),
    secretsReEncrypted: v.number(),
    membersRewrapped: v.number(),
    newKeyVersion: v.number(),
  }),
  handler: async (ctx, args) => {
    const projects = await ctx.db
      .query("project")
      .withIndex("by_owner", (q) =>
        q.eq("ownerType", "organization").eq("ownerId", args.organizationId),
      )
      .collect();

    if (projects.length === 0) {
      throw new ConvexError({
        code: "NO_PROJECTS_FOUND",
        message: "Organization has no projects",
        severity: ErrorSeverity.High,
      });
    }

    const secretsByProject = await Promise.all(
      projects.map((project) =>
        ctx.db
          .query("secret")
          .withIndex("by_project", (q) => q.eq("projectId", project._id))
          .filter((q) => q.eq(q.field("isDeleted"), false))
          .collect(),
      ),
    );

    const secrets = secretsByProject.flat();

    if (args.secrets.length !== secrets.length) {
      throw new ConvexError({
        code: "SECRETS_ARGUMENT_LENGHT_AND_TOTAL_SECRET_LENGTH_MISMATCHED",
        message:
          "You need to provide secrets as matched with the total secrets in the organization",
        severity: ErrorSeverity.High,
      });
    }

    const { membersRewrapped } = await ctx.runMutation(
      components.betterAuth.organization.rotateKeys,
      {
        orgId: args.organizationId,
        memberIds: args.memberIds,
        wrappedOrgKeys: args.wrappedOrgKeys,
        newKeyVersion: args.newKeyVersion,
      },
    );

    let secretsReEncrypted = 0;

    for (const secret of args.secrets) {
      try {
        await ctx.db.patch(secret.secretId, {
          encryptedValue: secret.encryptedValue,
          encryptionKeyVersion: args.newKeyVersion,
          updatedBy: args.userId,
          updatedAt: Date.now(),
        });

        secretsReEncrypted += 1;
      } catch (error) {
        throw new ConvexError({
          code: "SERVER_ERROR",
          message: error instanceof Error ? error.message : String(error),
          severity: ErrorSeverity.High,
        });
      }
    }

    await ctx.db.insert("keyRotation", {
      organizationId: args.organizationId,
      oldKeyVersion: args.newKeyVersion - 1,
      newKeyVersion: args.newKeyVersion,
      secretsReEncrypted,
      membersRewrapped,
      reason: args.reason,
      rotatedBy: args.userId,
      rotatedAt: Date.now(),
    });

    return {
      success: true,
      secretsReEncrypted,
      membersRewrapped,
      newKeyVersion: args.newKeyVersion,
    };
  },
});

export const _handleOrganizationActivation = internalMutation({
  args: {
    organizationId: v.id("organization"),
  },
  handler: async (ctx, args) => {
    const org = await ctx.runQuery(components.betterAuth.organization.loadOrganizationById, {
      organizationId: args.organizationId,
    });

    if (!org) {
      throw new ConvexError({
        code: "ORGANIZATION_NOT_FOUND",
        message: "Organization not found",
        severity: ErrorSeverity.High,
      });
    }

    if (org.subscriptionStatus === OrgSubscriptionStatus.Active) {
      return;
    }

    await ctx.runMutation(components.betterAuth.organization.activateOrganization, {
      organizationId: args.organizationId,
    });
  },
});

export const _handleOrganizationPaymentLapsed = internalMutation({
  args: {
    organizationId: v.id("organization"),
  },
  handler: async (ctx, args) => {
    const org = await ctx.runQuery(components.betterAuth.organization.loadOrganizationById, {
      organizationId: args.organizationId,
    });

    if (!org) {
      throw new ConvexError({
        code: "ORGANIZATION_NOT_FOUND",
        message: "Organization not found",
        severity: ErrorSeverity.High,
      });
    }

    await ctx.runMutation(components.betterAuth.organization.markOrganizationPaymentLapsed, {
      organizationId: args.organizationId,
      paymentLapsedAt: Date.now(),
    });
  },
});

export const _handleOrganizationSuspension = internalMutation({
  args: {
    organizationId: v.id("organization"),
  },
  handler: async (ctx, args) => {
    const org = await ctx.runQuery(components.betterAuth.organization.loadOrganizationById, {
      organizationId: args.organizationId,
    });

    if (!org) {
      throw new ConvexError({
        code: "ORGANIZATION_NOT_FOUND",
        message: "Organization not found",
        severity: ErrorSeverity.High,
      });
    }

    await ctx.runMutation(components.betterAuth.organization.suspendOrganization, {
      organizationId: args.organizationId,
    });
  },
});
