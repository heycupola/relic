import { ConvexError, v } from "convex/values";
import { doc } from "convex-helpers/validators";
import { ErrorSeverity } from "../lib/types";
import type { Id } from "./_generated/dataModel";
import { internalMutation, mutation, query } from "./_generated/server";
import { generateSlug } from "./lib/helpers";
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

export const getOrganizations = query({
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
      paymentLapsedAt: undefined,
      subscriptionStatus: OrgSubscriptionStatus.Suspended,
      suspendedAt: Date.now(),
    });

    return { success: true };
  },
});

export const markOrganizationPaymentLapsed = mutation({
  args: {
    organizationId: v.id("organization"),
  },
  returns: v.object({
    success: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.organizationId, {
      paymentLapsedAt: Date.now(),
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
  }),
  handler: async (ctx, args) => {
    const slug = generateSlug(args.name);
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1_000;

    const organizationId = await ctx.db.insert("organization", {
      name: args.name,
      slug,
      isFreeWithProPlan: args.isFreeWithProPlan,
      currentKeyVersion: 1,
      createdAt: now,
      subscriptionStatus: args.isFreeWithProPlan
        ? OrgSubscriptionStatus.Active
        : OrgSubscriptionStatus.Pending,
      paymentExpiresAt: args.isFreeWithProPlan ? null : now + oneDay,
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

    return { success: true, organizationId };
  },
});

export const rotateKeys = mutation({
  args: {
    orgId: v.id("organization"),
    wrappedOrgKeys: v.array(v.string()),
  },
  returns: v.object({
    success: v.boolean(),
    rotatedKeysLength: v.number(),
    skippedKeysLength: v.number(),
  }),
  handler: async (ctx, args) => {
    const members = await ctx.db
      .query("member")
      .filter((q) => q.eq(q.field("organizationId"), args.orgId))
      .collect();

    let rotatedKeysLength = 0;
    let skippedKeysLength = 0;

    if (members.length === 0) {
      return { success: true, rotatedKeysLength, skippedKeysLength };
    }

    for (const [index, member] of members.entries()) {
      try {
        const wrappedOrgKey = args.wrappedOrgKeys[index];
        if (!wrappedOrgKey) {
          skippedKeysLength += 1;
          continue;
        }

        await ctx.db.patch(member._id, {
          wrappedOrgKey,
          keyVersion: member.keyVersion ? member.keyVersion + 1 : 1,
        });

        rotatedKeysLength += 1;
      } catch {
        skippedKeysLength += 1;
      }
    }

    return { success: true, rotatedKeysLength, skippedKeysLength };
  },
});

export const sweepPendingOrganizations = internalMutation({
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
