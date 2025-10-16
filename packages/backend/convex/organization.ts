import { v } from "convex/values";
import { autumn } from "./autumn";
import { protectedMutation, protectedQuery } from "./lib/middleware";

export const initializeOrganization = protectedMutation({
  args: {
    organizationId: v.string(),
    wrapperOrgKey: v.string(),
  },
  handler: async (ctx, args) => {
    const { data, error } = await autumn.check(ctx, {
      featureId: "can_create_org",
    });

    if (error || !data) {
      throw new Error(`Failed to check subscription: ${error?.message || "Unknown error"}`);
    }

    if (!data.allowed) {
      throw new Error("You need a Pro plan to create organizations. Please upgrade.");
    }

    const existingSetting = await ctx.db
      .query("organizationSetting")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .first();

    if (existingSetting) {
      throw new Error("Organization already initialized");
    }

    const now = Date.now();

    await ctx.db.insert("organizationSetting", {
      organizationId: args.organizationId,
      billingUserId: ctx.userId,
      isFreeWithProPlan: true,
      autumnCustomerId: args.organizationId,
      currentKeyVersion: 1,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("organizationMember", {
      organizationId: args.organizationId,
      userId: ctx.userId,
      role: "owner",
      wrappedOrgKey: args.wrapperOrgKey,
      keyVersion: 1,
      grantedBy: ctx.userId,
      grantedAt: now,
    });

    await autumn.entities.create(ctx, {
      id: args.organizationId,
    });

    await autumn.track(ctx, {
      entityId: args.organizationId,
      featureId: "members",
      value: 1,
    });

    return { success: true };
  },
});

export const addMember = protectedMutation({
  args: {
    organizationId: v.string(),
    userId: v.string(),
    role: v.union(v.literal("owner"), v.literal("admin"), v.literal("member"), v.literal("viewer")),
    wrappedOrgKey: v.string(),
  },
  handler: async (ctx, args) => {
    const requesterMembership = await ctx.db
      .query("organizationMember")
      .withIndex("by_org_and_user", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", ctx.userId),
      )
      .filter((q) => q.eq(q.field("revokedAt"), undefined))
      .first();

    if (
      !requesterMembership ||
      (requesterMembership.role !== "owner" && requesterMembership.role !== "admin")
    ) {
      throw new Error("Only organization owners and admins can add members");
    }

    const { data, error } = await autumn.check(ctx, {
      entityId: args.organizationId,
      featureId: "members",
    });

    if (error || !data) {
      throw new Error(
        `Failed to check organization subscription: ${error?.message || "Unknown error"}`,
      );
    }

    const limit = data.included_usage || 5;
    const currentUsage = data.usage || 0;

    if (!data.allowed) {
      throw new Error(
        `Organization member limit reached (${currentUsage}/${limit}). Please add more seats.`,
      );
    }

    const targetUserKey = await ctx.db
      .query("userKey")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    if (!targetUserKey) {
      throw new Error("Target user does not have encryption keys");
    }

    const existingMembership = await ctx.db
      .query("organizationMember")
      .withIndex("by_org_and_user", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", args.userId),
      )
      .filter((q) => q.eq(q.field("revokedAt"), undefined))
      .first();

    if (existingMembership) {
      throw new Error("User is already a member of this organization");
    }

    const settings = await ctx.db
      .query("organizationSetting")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .first();

    if (!settings) {
      throw new Error("Organization settings not found");
    }

    const now = Date.now();
    const memberId = await ctx.db.insert("organizationMember", {
      organizationId: args.organizationId,
      userId: args.userId,
      role: args.role,
      wrappedOrgKey: args.wrappedOrgKey,
      keyVersion: settings.currentKeyVersion,
      grantedBy: ctx.userId,
      grantedAt: now,
    });

    await autumn.track(ctx, {
      entityId: args.organizationId,
      featureId: "members",
      value: 1,
    });

    return { success: true, memberId };
  },
});

export const removeMember = protectedMutation({
  args: {
    organizationId: v.string(),
    userId: v.string(),
    reason: v.union(v.literal("left"), v.literal("removed")),
  },
  handler: async (ctx, args) => {
    const requesterMembership = await ctx.db
      .query("organizationMember")
      .withIndex("by_org_and_user", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", ctx.userId),
      )
      .filter((q) => q.eq(q.field("revokedAt"), undefined))
      .first();

    if (!requesterMembership) {
      throw new Error("You are not a member of this organization");
    }

    const targetMembership = await ctx.db
      .query("organizationMember")
      .withIndex("by_org_and_user", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", args.userId),
      )
      .filter((q) => q.eq(q.field("revokedAt"), undefined))
      .first();

    if (!targetMembership) {
      throw new Error("Target user is not a member of this organization");
    }

    if (args.reason === "removed") {
      if (requesterMembership.role !== "owner" && requesterMembership.role !== "admin") {
        throw new Error("Only owners and admins can remove members");
      }
      if (targetMembership.role === "owner" && requesterMembership.role !== "owner") {
        throw new Error("Only owners can remove other owners");
      }
    } else {
      if (ctx.userId !== args.userId) {
        throw new Error("You can only remove yourself with reason 'left'");
      }
    }

    const now = Date.now();
    await ctx.db.patch(targetMembership._id, {
      revokedAt: now,
      revokedBy: ctx.userId,
      revocationReason: args.reason,
    });

    await autumn.track(ctx, {
      entityId: args.organizationId,
      featureId: "members",
      value: -1,
    });

    return {
      success: true,
      shouldRotateKey: true,
      message: "Member removed. Consider key rotation for security.",
    };
  },
});

export const listMembers = protectedQuery({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    const membership = await ctx.db
      .query("organizationMember")
      .withIndex("by_org_and_user", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", ctx.userId),
      )
      .filter((q) => q.eq(q.field("revokedAt"), undefined))
      .first();

    if (!membership) {
      throw new Error("You are not a member of this organization");
    }

    const members = await ctx.db
      .query("organizationMember")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .filter((q) => q.eq(q.field("revokedAt"), undefined))
      .collect();

    return members.map((m) => ({
      id: m._id,
      userId: m.userId,
      role: m.role,
      keyVersion: m.keyVersion,
      grantedBy: m.grantedBy,
      grantedAt: m.grantedAt,
    }));
  },
});

export const getUserOrganizations = protectedQuery({
  args: {},
  handler: async (ctx) => {
    const membership = await ctx.db
      .query("organizationMember")
      .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
      .filter((q) => q.eq(q.field("revokedAt"), undefined))
      .collect();

    return membership.map((m) => ({
      organizationId: m.organizationId,
      role: m.role,
      wrappedOrgKey: m.wrappedOrgKey,
      keyVersion: m.keyVersion,
      grantedAt: m.grantedAt,
    }));
  },
});

export const getOrganizationSettings = protectedQuery({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    const membership = await ctx.db
      .query("organizationMember")
      .withIndex("by_org_and_user", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", ctx.userId),
      )
      .filter((q) => q.eq(q.field("revokedAt"), undefined))
      .first();

    if (!membership) {
      throw new Error("You are not a member of this organization");
    }

    const settings = await ctx.db
      .query("organizationSetting")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .first();

    if (!settings) {
      throw new Error("Organization settings not found");
    }

    return {
      organizationId: settings.organizationId,
      currentKeyVersion: settings.currentKeyVersion,
      isFreeWithProPlan: settings.isFreeWithProPlan,
      userRole: membership.role,
      userWrappedOrgKey: membership.wrappedOrgKey,
      userKeyVersion: membership.keyVersion,
      needsKeyRotation: membership.keyVersion < settings.currentKeyVersion,
    };
  },
});
