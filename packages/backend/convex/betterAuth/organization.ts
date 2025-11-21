import { ConvexError, v } from "convex/values";
import { doc } from "convex-helpers/validators";
import { generateSlug } from "../lib/helpers";
import { ErrorSeverity } from "../lib/types";
import type { Id } from "./_generated/dataModel";
import { internalMutation, mutation, query } from "./_generated/server";
import { OrgRole, OrgSubscriptionStatus } from "./lib/types";
import schema from "./schema";

export const loadOrganizationById = query({
  args: {
    organizationId: v.id("organization"),
  },
  returns: v.union(v.null(), doc(schema, "organization")),
  handler: async (ctx, args) => {
    const organization = await ctx.db.get(args.organizationId);

    return organization;
  },
});

export const loadOrganizationsByUserId = query({
  args: {
    userId: v.id("user"),
  },
  returns: v.object({
    success: v.boolean(),
    totalOrganizations: v.number(),
    organizations: v.union(v.null(), v.array(doc(schema, "organization"))),
  }),
  handler: async (ctx, args) => {
    const memberships = await ctx.db
      .query("member")
      .withIndex("userId", (q) => q.eq("userId", args.userId))
      .filter((q) => q.and(q.eq(q.field("isPending"), false), q.eq(q.field("revokedAt"), null)))
      .collect();

    if (memberships.length === 0) {
      return {
        success: true,
        totalOrganizations: 0,
        organizations: null,
      };
    }

    const orgs = await Promise.all(
      memberships.map((membership) => ctx.db.get(membership.organizationId as Id<"organization">)),
    );

    const validOrgs = orgs.filter((org) => org !== null);

    return {
      success: true,
      totalOrganizations: validOrgs.length,
      organizations: validOrgs,
    };
  },
});

export const activateOrganization = mutation({
  args: {
    organizationId: v.id("organization"),
  },
  returns: v.object({
    success: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const org = await ctx.db.get(args.organizationId);

    if (!org) {
      throw new ConvexError({
        code: "ORGANIZATION_NOT_FOUND",
        message: "Organization not found",
        severity: ErrorSeverity.High,
      });
    }

    if (org.subscriptionStatus === OrgSubscriptionStatus.Active) {
      return { success: true };
    }

    await ctx.db.patch(args.organizationId, {
      subscriptionStatus: OrgSubscriptionStatus.Active,
      paymentExpiresAt: null,
      suspendedAt: null,
    });

    return { success: true };
  },
});

export const wipeOrganization = mutation({
  args: {
    organizationId: v.id("organization"),
  },
  returns: v.object({
    success: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const members = await ctx.db
      .query("member")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", args.organizationId))
      .filter((q) => q.and(q.eq(q.field("isPending"), false), q.eq(q.field("revokedAt"), null)))
      .collect();

    await ctx.db.delete(args.organizationId);

    if (members.length > 0) {
      for (const member of members) {
        await ctx.db.delete(member._id);
      }
    }

    return { success: true };
  },
});

export const suspendOrganization = mutation({
  args: {
    organizationId: v.id("organization"),
  },
  returns: v.object({
    success: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.organizationId, {
      paymentLapsedAt: null,
      subscriptionStatus: OrgSubscriptionStatus.Suspended,
      suspendedAt: Date.now(),
    });

    return { success: true };
  },
});

export const markOrganizationPaymentLapsed = mutation({
  args: {
    organizationId: v.id("organization"),
    paymentLapsedAt: v.number(),
  },
  returns: v.object({
    success: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.organizationId, {
      paymentLapsedAt: args.paymentLapsedAt,
      subscriptionStatus: OrgSubscriptionStatus.PaymentLapsed,
    });

    return { success: true };
  },
});

export const deleteOrganization = mutation({
  args: {
    callerId: v.id("user"),
    organizationId: v.id("organization"),
  },
  returns: v.object({
    success: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const members = await ctx.db
      .query("member")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", args.organizationId))
      .filter((q) => q.and(q.eq(q.field("isPending"), false), q.eq(q.field("revokedAt"), null)))
      .collect();

    if (members.length === 0) {
      throw new ConvexError({
        code: "MEMBERS_NOT_FOUND",
        message: "No member data has tracked",
        severity: ErrorSeverity.Medium,
      });
    } else if (members.length === 1) {
      const member = members[0]!;

      if (member.userId !== args.callerId) {
        throw new ConvexError({
          code: "WRONG_ORGANIZATION",
          message: "You're not a member of this organization",
          severity: ErrorSeverity.High,
        });
      }

      if (member.role !== OrgRole.Owner) {
        throw new ConvexError({
          code: "INSUFFICIENT_AUTHORIZATION",
          message: "Only owner can delete the organization",
          severity: ErrorSeverity.High,
        });
      }
    } else if (members.length > 1) {
      throw new ConvexError({
        code: "ORGANIZATION_HAS_MEMBER",
        message: "Please remove members before deleting organization",
        severity: ErrorSeverity.Low,
      });
    }

    await ctx.db.delete(args.organizationId);
    await ctx.db.delete(members[0]!._id);

    return { success: true };
  },
});

export const createOrganization = mutation({
  args: {
    ownerId: v.id("user"),
    name: v.string(),
    isFreeWithProPlan: v.boolean(),
    wrappedOrgKey: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
    organizationId: v.id("organization"),
    subscriptionStatus: v.union(
      v.literal(OrgSubscriptionStatus.Active),
      v.literal(OrgSubscriptionStatus.Pending),
    ),
    slug: v.string(),
    paymentExpiresAt: v.optional(v.number()),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    success: boolean;
    organizationId: Id<"organization">;
    subscriptionStatus: OrgSubscriptionStatus.Active | OrgSubscriptionStatus.Pending;
    slug: string;
    paymentExpiresAt: number | undefined;
  }> => {
    const slug = generateSlug(args.name);
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1_000;

    const subscriptionStatus = args.isFreeWithProPlan
      ? OrgSubscriptionStatus.Active
      : OrgSubscriptionStatus.Pending;
    const paymentExpiresAt = args.isFreeWithProPlan ? undefined : now + oneDay;

    const organizationId = await ctx.db.insert("organization", {
      name: args.name,
      slug,
      isFreeWithProPlan: args.isFreeWithProPlan,
      currentKeyVersion: 1,
      createdAt: now,
      subscriptionStatus,
      paymentExpiresAt,
    });

    await ctx.db.insert("member", {
      organizationId,
      userId: args.ownerId,
      role: OrgRole.Owner,
      grantedBy: "god",
      createdAt: now,
      wrappedOrgKey: args.wrappedOrgKey,
      keyVersion: 1,
      isPending: false,
    });

    return {
      success: true,
      organizationId,
      slug,
      subscriptionStatus,
      paymentExpiresAt,
    };
  },
});

export const rotateKeys = mutation({
  args: {
    orgId: v.id("organization"),
    memberIds: v.array(v.id("member")),
    wrappedOrgKeys: v.array(v.string()),
    newKeyVersion: v.number(),
  },
  returns: v.object({
    success: v.boolean(),
    membersRewrapped: v.number(),
  }),
  handler: async (ctx, args) => {
    if (args.memberIds.length !== args.wrappedOrgKeys.length) {
      throw new ConvexError({
        code: "MEMBER_IDS_AND_WRAPPED_ORG_KEYS_MISMATCHED",
        message: "You provided either wrong set of ids or keys",
        severity: ErrorSeverity.High,
      });
    }

    const members = await ctx.db
      .query("member")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", args.orgId))
      .filter((q) => q.and(q.eq(q.field("isPending"), false), q.eq(q.field("revokedAt"), null)))
      .collect();

    if (members.length === 0) {
      throw new ConvexError({
        code: "NO_MEMBERS",
        message: "No members found in the organization",
        severity: ErrorSeverity.Low,
      });
    }

    if (members.length !== args.memberIds.length) {
      throw new ConvexError({
        code: "MEMBER_LENGTH_AND_MEMBER_IDS_LENGTH_MISMATCHED",
        message: "You need to provide ids of the entire members in the organization",
        severity: ErrorSeverity.High,
      });
    }

    let membersRewrapped = 0;

    for (const [index, memberId] of args.memberIds.entries()) {
      try {
        const wrappedOrgKey = args.wrappedOrgKeys[index];

        await ctx.db.patch(memberId, {
          wrappedOrgKey,
          keyVersion: args.newKeyVersion,
        });

        membersRewrapped += 1;
      } catch (error) {
        throw new ConvexError({
          code: "SERVER_ERROR",
          message: error instanceof Error ? error.message : String(error),
          severity: ErrorSeverity.High,
        });
      }
    }

    await ctx.db.patch(args.orgId, {
      currentKeyVersion: args.newKeyVersion,
    });

    return { success: true, membersRewrapped };
  },
});

export const _sweepPendingOrganizations = internalMutation({
  returns: v.object({
    success: v.boolean(),
    totalSwept: v.number(),
    totalSkipped: v.number(),
  }),
  handler: async (ctx, _args) => {
    const oneDayMs = 24 * 60 * 60 * 1000;
    const now = Date.now();

    const pendingOrgs = await ctx.db
      .query("organization")
      .withIndex("by_subscriptionStatus", (q) =>
        q.eq("subscriptionStatus", OrgSubscriptionStatus.Pending),
      )
      .filter((q) => q.lt(q.field("createdAt"), now - oneDayMs))
      .collect();

    let totalSwept = 0;
    let totalSkipped = 0;

    if (pendingOrgs.length === 0) {
      return { success: true, totalSwept, totalSkipped };
    }

    for (const org of pendingOrgs) {
      try {
        const members = await ctx.db
          .query("member")
          .filter((q) => q.eq(q.field("organizationId"), org._id))
          .collect();

        for (const member of members) {
          await ctx.db.delete(member._id);
        }

        await ctx.db.delete(org._id);

        totalSwept += 1;
      } catch {
        totalSkipped += 1;
      }
    }

    return { success: true, totalSwept, totalSkipped };
  },
});
