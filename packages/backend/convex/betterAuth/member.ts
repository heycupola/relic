import { ConvexError, v } from "convex/values";
import { doc } from "convex-helpers/validators";
import { createError, ErrorCode, notFoundError, permissionError } from "../lib/errors";
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

export const removeMember = mutation({
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
      throw notFoundError("organization");
    }

    if (args.fromId === args.toId) {
      throw createError({
        code: ErrorCode.INVALID_OPERATION,
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
      throw notFoundError("member");
    }

    if (toMember.role === OrgRole.Owner) {
      throw permissionError("remove the owner", ErrorSeverity.High);
    }

    if (fromMember.role !== OrgRole.Owner && fromMember.role !== OrgRole.Admin) {
      throw permissionError("remove members from this organization", ErrorSeverity.High);
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
      throw notFoundError("member");
    }

    if (member.role === OrgRole.Owner) {
      throw permissionError("leave as owner (delete organization instead)", ErrorSeverity.High);
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
      throw notFoundError("membership");
    }

    if (updaterMembership.role !== OrgRole.Owner && updaterMembership.role !== OrgRole.Admin) {
      throw permissionError("update member roles", ErrorSeverity.High);
    }

    const updateeMembership = await ctx.db
      .query("member")
      .withIndex("organizationId_userId", (q) =>
        q.eq("organizationId", args.orgId).eq("userId", args.updateeId),
      )
      .first();

    if (!updateeMembership || updateeMembership.revokedAt || updateeMembership.isPending) {
      throw notFoundError("member");
    }

    await ctx.db.patch(updateeMembership._id, {
      role: args.newRole,
    });

    return { success: true };
  },
});

export const setMemberKey = mutation({
  args: {
    memberId: v.id("member"),
    wrappedOrgKey: v.string(),
    newKeyVersion: v.number(),
  },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args) => {
    const member = await ctx.db.get(args.memberId);

    if (!member || member.revokedAt) {
      throw notFoundError("member");
    }

    await ctx.db.patch(member._id, {
      wrappedOrgKey: args.wrappedOrgKey,
      keyVersion: args.newKeyVersion,
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
