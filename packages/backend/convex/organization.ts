import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { autumn } from "./autumn";
import { protectedMutation, protectedQuery } from "./lib/middleware";
import type { ProtectedMutationCtx, ProtectedQueryCtx } from "./lib/types";

export const initializeOrganization = protectedMutation({
  args: {
    organizationId: v.string(),
    wrapperOrgKey: v.string(),
  },
  handler: async (
    ctx: ProtectedMutationCtx,
    args: { organizationId: string; wrapperOrgKey: string },
  ) => {
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

    // Track initial member - entity will be auto-created
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
    userEmail: v.string(),
    role: v.union(v.literal("owner"), v.literal("admin"), v.literal("member"), v.literal("viewer")),
    wrappedOrgKey: v.string(),
  },
  handler: async (
    ctx: ProtectedMutationCtx,
    args: {
      organizationId: string;
      userEmail: string;
      role: "owner" | "admin" | "member" | "viewer";
      wrappedOrgKey: string;
    },
  ) => {
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

    const targetUser = await ctx.db
      .query("user")
      .withIndex("by_email", (q) => q.eq("email", args.userEmail))
      .first();

    if (!targetUser) {
      throw new Error("User not found. They must sign up first.");
    }

    const targetUserKey = await ctx.db
      .query("userKey")
      .withIndex("by_user", (q) => q.eq("userId", targetUser._id))
      .first();

    if (!targetUserKey) {
      throw new Error("Target user does not have encryption keys");
    }

    const existingMembership = await ctx.db
      .query("organizationMember")
      .withIndex("by_org_and_user", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", targetUser._id),
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
      userId: targetUser._id,
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

    return { success: true, memberId, userId: targetUser._id };
  },
});

export const removeMember = protectedMutation({
  args: {
    organizationId: v.string(),
    userId: v.id("user"),
    reason: v.union(v.literal("left"), v.literal("removed")),
  },
  handler: async (
    ctx: ProtectedMutationCtx,
    args: { organizationId: string; userId: Id<"user">; reason: "left" | "removed" },
  ) => {
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
  handler: async (ctx: ProtectedQueryCtx, args: { organizationId: string }) => {
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
  handler: async (ctx: ProtectedQueryCtx) => {
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
  handler: async (ctx: ProtectedQueryCtx, args: { organizationId: string }) => {
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

export const rotateOrganizationKeys = protectedMutation({
  args: {
    organizationId: v.string(),
    newKeyVersion: v.number(),
    secrets: v.array(
      v.object({
        secretId: v.id("secret"),
        encryptedValue: v.string(),
        encryptionKeyVersion: v.number(),
      }),
    ),
    members: v.array(
      v.object({
        userEmail: v.string(),
        wrappedOrgKey: v.string(),
      }),
    ),
    reason: v.optional(
      v.union(v.literal("member_removed"), v.literal("scheduled"), v.literal("manual")),
    ),
  },
  handler: async (
    ctx: ProtectedMutationCtx,
    args: {
      organizationId: string;
      newKeyVersion: number;
      secrets: Array<{
        secretId: Id<"secret">;
        encryptedValue: string;
        encryptionKeyVersion: number;
      }>;
      members: Array<{ userEmail: string; wrappedOrgKey: string }>;
      reason?: "member_removed" | "scheduled" | "manual";
    },
  ) => {
    const requesterMembership = await ctx.db
      .query("organizationMember")
      .withIndex("by_org_and_user", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", ctx.userId),
      )
      .filter((q) => q.eq(q.field("revokedAt"), undefined))
      .first();

    if (!requesterMembership || requesterMembership.role !== "owner") {
      throw new Error("Only organization owners can rotate keys");
    }

    const settings = await ctx.db
      .query("organizationSetting")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .first();

    if (!settings) {
      throw new Error("Organization settings not found");
    }

    if (args.newKeyVersion !== settings.currentKeyVersion + 1) {
      throw new Error(
        `Invalid key version. Expected ${settings.currentKeyVersion + 1}, got ${args.newKeyVersion}`,
      );
    }

    const now = Date.now();

    for (const secretUpdate of args.secrets) {
      await ctx.db.patch(secretUpdate.secretId, {
        encryptedValue: secretUpdate.encryptedValue,
        encryptionKeyVersion: secretUpdate.encryptionKeyVersion,
        updatedBy: ctx.userId,
        updatedAt: now,
      });
    }

    for (const memberUpdate of args.members) {
      const targetUser = await ctx.db
        .query("user")
        .withIndex("by_email", (q) => q.eq("email", memberUpdate.userEmail))
        .first();

      if (!targetUser) continue;

      const membership = await ctx.db
        .query("organizationMember")
        .withIndex("by_org_and_user", (q) =>
          q.eq("organizationId", args.organizationId).eq("userId", targetUser._id),
        )
        .filter((q) => q.eq(q.field("revokedAt"), undefined))
        .first();

      if (membership) {
        await ctx.db.patch(membership._id, {
          wrappedOrgKey: memberUpdate.wrappedOrgKey,
          keyVersion: args.newKeyVersion,
        });
      }
    }

    await ctx.db.patch(settings._id, {
      currentKeyVersion: args.newKeyVersion,
      updatedAt: now,
    });

    await ctx.db.insert("keyRotation", {
      organizationId: args.organizationId,
      oldKeyVersion: settings.currentKeyVersion,
      newKeyVersion: args.newKeyVersion,
      secretsReEncrypted: args.secrets.length,
      membersRewrapped: args.members.length,
      reason: args.reason,
      rotatedBy: ctx.userId,
      rotatedAt: now,
    });

    return {
      success: true,
      newKeyVersion: args.newKeyVersion,
      secretsReEncrypted: args.secrets.length,
      membersRewrapped: args.members.length,
    };
  },
});
