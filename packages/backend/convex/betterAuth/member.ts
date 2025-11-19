import { ConvexError, v } from "convex/values";
import { doc } from "convex-helpers/validators";
import { ErrorSeverity } from "../lib/types";
import { mutation, query } from "./_generated/server";
import { MembershipRevocationReason, OrgRole } from "./lib/types";
import schema from "./schema";

export const isOrganizationMember = query({
  args: {
    organizationId: v.id("organization"),
    userId: v.id("user"),
  },
  returns: v.object({
    success: v.boolean(),
    isOrganizationMember: v.boolean(),
    role: v.optional(
      v.union(
        v.literal(OrgRole.Owner),
        v.literal(OrgRole.Admin),
        v.literal(OrgRole.Member),
        v.literal(OrgRole.Viewer),
      ),
    ),
  }),
  handler: async (ctx, args) => {
    const membership = await ctx.db
      .query("member")
      .withIndex("organizationId_userId", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", args.userId),
      )
      .first();

    if (!membership) {
      return {
        success: true,
        isOrganizationMember: false,
        role: undefined,
      };
    }

    return {
      success: true,
      isOrganizationMember: true,
      role: membership.role as OrgRole,
    };
  },
});

export const getOrganizationMembers = query({
  args: {
    orgId: v.id("organization"),
  },
  returns: v.array(doc(schema, "member")),
  handler: async (ctx, args) => {
    const members = await ctx.db
      .query("member")
      .withIndex("organizationId_userId", (q) => q.eq("organizationId", args.orgId))
      .collect();

    return members;
  },
});

export const removeUser = mutation({
  args: {
    organizationId: v.id("organization"),
    fromId: v.id("user"),
    toId: v.id("user"),
  },
  returns: v.object({
    success: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const organization = await ctx.db.get(args.organizationId);

    if (!organization) {
      throw new ConvexError({
        code: "ORGANIZATION_NOT_FOUND",
        message: "Unable to find organization",
        severity: ErrorSeverity.High,
      });
    }

    if (args.fromId === args.toId) {
      throw new ConvexError({
        code: "WRONG_ACTION",
        message: "You cannot remove yourself",
        severity: ErrorSeverity.High,
      });
    }

    const [fromMember, toMember] = await Promise.all([
      ctx.db
        .query("member")
        .withIndex("organizationId_userId", (q) =>
          q.eq("organizationId", args.organizationId).eq("userId", args.fromId),
        )
        .filter((q) => q.and(q.eq(q.field("isPending"), false), q.eq(q.field("revokedAt"), null)))
        .first(),
      ctx.db
        .query("member")
        .withIndex("organizationId_userId", (q) =>
          q.eq("organizationId", args.organizationId).eq("userId", args.toId),
        )
        .filter((q) => q.and(q.eq(q.field("isPending"), false), q.eq(q.field("revokedAt"), null)))
        .first(),
    ]);

    if (!fromMember || !toMember) {
      throw new ConvexError({
        code: "WRONG_MEMBERS",
        message: "One or both members are wrong",
        severity: ErrorSeverity.High,
      });
    }

    if (toMember.role === OrgRole.Owner) {
      throw new ConvexError({
        code: "INSUFFICIENT_AUTHORIZATION",
        message: "Owners cannot be removed",
        severity: ErrorSeverity.High,
      });
    }

    if (fromMember.role !== OrgRole.Owner && fromMember.role !== OrgRole.Admin) {
      throw new ConvexError({
        code: "INSUFFICIENT_AUTHORIZATION",
        message: "Only owner and admins can remove a user",
        severity: ErrorSeverity.High,
      });
    }

    await ctx.db.patch(toMember._id, {
      revocationReason: MembershipRevocationReason.Removed,
      revokedAt: Date.now(),
      revokedBy: args.fromId,
    });

    return { success: true };
  },
});

export const leaveOrganization = mutation({
  args: {
    organizationId: v.id("organization"),
    userId: v.id("user"),
  },
  returns: v.object({
    success: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const member = await ctx.db
      .query("member")
      .withIndex("organizationId_userId", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", args.userId),
      )
      .filter((q) => q.and(q.eq(q.field("isPending"), false), q.eq(q.field("revokedAt"), null)))
      .first();

    if (!member) {
      throw new ConvexError({
        code: "MEMBER_NOT_FOUND",
        message: "Member not found",
        severity: ErrorSeverity.High,
      });
    }

    if (member.role === OrgRole.Owner) {
      throw new ConvexError({
        code: "FORBIDDEN_ACTION",
        message: "Owners cannot leave organizations unless they are deleting it",
        severity: ErrorSeverity.High,
      });
    }

    await ctx.db.patch(member._id, {
      revokedAt: Date.now(),
      revocationReason: MembershipRevocationReason.Left,
      revokedBy: args.userId,
    });

    return { success: true };
  },
});

export const updateMemberRole = mutation({
  args: {
    updaterId: v.id("user"),
    updateeId: v.id("user"),
    orgId: v.id("organization"),
    newRole: v.union(
      v.literal(OrgRole.Admin),
      v.literal(OrgRole.Viewer),
      v.literal(OrgRole.Member),
    ),
  },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args) => {
    const updaterMembership = await ctx.db
      .query("member")
      .withIndex("organizationId_userId", (q) =>
        q.eq("organizationId", args.orgId).eq("userId", args.updaterId),
      )
      .first();

    if (!updaterMembership || updaterMembership.revokedAt || updaterMembership.isPending) {
      throw new ConvexError({
        code: "NO_MEMBERSHIP",
        message: "Membership not found",
        severity: ErrorSeverity.High,
      });
    }

    if (updaterMembership.role !== OrgRole.Owner && updaterMembership.role !== OrgRole.Admin) {
      throw new ConvexError({
        code: "INSUFFICIENT_AUTHORIZATION",
        message: "You're not authorized to make this action",
        severity: ErrorSeverity.High,
      });
    }

    const updateeMembership = await ctx.db
      .query("member")
      .withIndex("organizationId_userId", (q) =>
        q.eq("organizationId", args.orgId).eq("userId", args.updateeId),
      )
      .first();

    if (!updateeMembership || updateeMembership.revokedAt || updateeMembership.isPending) {
      throw new ConvexError({
        code: "MEMBER_NOT_FOUND",
        message: "Member not found",
        severity: ErrorSeverity.High,
      });
    }

    await ctx.db.patch(updateeMembership._id, {
      role: args.newRole,
    });

    return { success: true };
  },
});

export const updateMemberKey = mutation({
  args: {
    userId: v.id("user"),
    orgId: v.id("organization"),
    wrappedOrgKey: v.string(),
  },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args) => {
    const member = await ctx.db
      .query("member")
      .withIndex("organizationId_userId", (q) =>
        q.eq("organizationId", args.orgId).eq("userId", args.userId),
      )
      .first();

    if (!member || member.revokedAt) {
      throw new ConvexError({
        code: "MEMBER_NOT_FOUND",
        message: "Member not found",
        severity: ErrorSeverity.High,
      });
    }

    await ctx.db.patch(member._id, {
      wrappedOrgKey: args.wrappedOrgKey,
      keyVersion: member.keyVersion || 1,
    });

    return { success: true };
  },
});

export const getMemberRole = query({
  args: {
    userId: v.id("user"),
    organizationId: v.id("organization"),
  },
  returns: v.object({
    success: v.boolean(),
    role: v.union(
      v.null(),
      v.literal(OrgRole.Owner),
      v.literal(OrgRole.Admin),
      v.literal(OrgRole.Member),
      v.literal(OrgRole.Viewer),
    ),
  }),
  handler: async (ctx, args) => {
    const membership = await ctx.db
      .query("member")
      .withIndex("organizationId_userId", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", args.userId),
      )
      .filter((q) => q.and(q.eq(q.field("revokedAt"), null), q.eq(q.field("isPending"), false)))
      .first();

    if (!membership) {
      return { success: false, role: null };
    }

    return { success: true, role: membership.role as OrgRole };
  },
});
