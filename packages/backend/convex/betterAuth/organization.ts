import { ConvexError, v } from "convex/values";
import { doc } from "convex-helpers/validators";
import type { Id } from "./_generated/dataModel";
import { internalMutation, mutation, query } from "./_generated/server";
import { generateSlug } from "./lib/helpers";
import { ErrorSeverity, OrgRole, OrgSubscriptionStatus } from "./lib/types";
import schema from "./schema";

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

    const organizationId = await ctx.db.insert("organization", {
      name: args.name,
      slug,
      isFreeWithProPlan: args.isFreeWithProPlan,
      currentKeyVersion: 1,
      createdAt: now,
      subscriptionStatus: args.isFreeWithProPlan
        ? OrgSubscriptionStatus.Active
        : OrgSubscriptionStatus.Pending,
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
