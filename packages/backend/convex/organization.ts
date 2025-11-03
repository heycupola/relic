import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
import { autumn, initLocalAutumn } from "./autumn";
import { protectedMutation, protectedQuery } from "./lib/middleware";
import { checkOrganizationSuspended, getOrganizationPaymentStatus } from "./lib/organizationAccess";
import { checkRateLimit } from "./lib/rateLimit";
import type { ProtectedMutationCtx, ProtectedQueryCtx } from "./lib/types";

// NOTE: better-auth org check doesn't exist
export const initializeOrganization = protectedMutation({
  args: {
    organizationId: v.string(),
    wrapperOrgKey: v.string(),
  },
  handler: async (
    ctx: ProtectedMutationCtx,
    args: { organizationId: string; wrapperOrgKey: string },
  ) => {
    const existingSetting = await ctx.db
      .query("organizationSetting")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .first();

    if (existingSetting) {
      throw new Error("Organization already initialized");
    }

    const user = await ctx.db.get(ctx.userId);

    if (!user) {
      throw new Error("User not found");
    }

    let isFreeWithProPlan = false;

    if (!user.freeOrganizationUsed) {
      const proCheck = await autumn.check(ctx, {
        featureId: "can_create_org",
      });

      if (proCheck.error || !proCheck.data) {
        throw new Error(`Failed to check Pro plan: ${proCheck.error?.message || "Unknown error"}`);
      }

      if (proCheck.data.allowed) {
        const freeOrgCheck = await autumn.check(ctx, {
          featureId: "free_org",
        });

        if (freeOrgCheck.error || !freeOrgCheck.data) {
          throw new Error(
            `Failed to check free org: ${freeOrgCheck.error?.message || "Unknown error"}`,
          );
        }

        if (freeOrgCheck.data.allowed) {
          isFreeWithProPlan = true;
        }
      }
    }

    if (!isFreeWithProPlan) {
      const orgSubCheck = await autumn.check(ctx, {
        entityId: args.organizationId,
        featureId: "organization_projects",
      });

      if (orgSubCheck.error || !orgSubCheck.data) {
        throw new Error(
          `Failed to check organization subscription: ${orgSubCheck.error?.message || "Unknown error"}`,
        );
      }

      if (!orgSubCheck.data.allowed) {
        throw new Error(
          "Subscribe this organization to the Organization plan on Autumn before initializing it.",
        );
      }
    }

    await checkRateLimit(ctx, "write");

    const now = Date.now();

    await ctx.db.insert("organizationSetting", {
      organizationId: args.organizationId,
      isFreeWithProPlan,
      currentKeyVersion: 1,
      subscriptionStatus: "active",
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

    await autumn.track(ctx, {
      entityId: args.organizationId,
      featureId: "members",
      value: 1,
    });

    if (isFreeWithProPlan) {
      await ctx.db.patch(ctx.userId, {
        freeOrganizationUsed: true,
        updatedAt: now,
      });

      await autumn.track(ctx, {
        featureId: "free_org",
        value: 1,
      });
    }

    return { success: true, isFreeWithProPlan };
  },
});

export const addMember = protectedMutation({
  args: {
    organizationId: v.string(),
    userEmail: v.string(),
    role: v.union(v.literal("admin"), v.literal("member"), v.literal("viewer")),
    wrappedOrgKey: v.string(),
  },
  handler: async (
    ctx: ProtectedMutationCtx,
    args: {
      organizationId: string;
      userEmail: string;
      role: "admin" | "member" | "viewer";
      wrappedOrgKey: string;
    },
  ) => {
    await checkOrganizationSuspended(ctx, args.organizationId);

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

    const limit = data.included_usage;
    const currentUsage = data.usage;

    if (!limit || !currentUsage) {
      throw new Error("No members found");
    }

    if (limit - currentUsage === 0) {
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

    await checkRateLimit(ctx, "write", args.organizationId);

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
    args: {
      organizationId: string;
      userId: Id<"user">;
      reason: "left" | "removed";
    },
  ) => {
    await checkOrganizationSuspended(ctx, args.organizationId);

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

    const settings = await ctx.db
      .query("organizationSetting")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .first();

    if (!settings) {
      throw new Error("Organization settings not found");
    }

    const isRequesterOwner = requesterMembership.role === "owner";
    const isRequesterAdmin = requesterMembership.role === "admin";
    const isRemovingSelf = ctx.userId === args.userId;
    const isTargetOwner = targetMembership.role === "owner";

    if (isRequesterAdmin && isTargetOwner && !isRemovingSelf) {
      throw new Error("Admins cannot remove the organization owner");
    }

    if (!isRequesterOwner && !isRequesterAdmin && !isRemovingSelf) {
      throw new Error("You can only remove yourself from the organization");
    }

    if (!isRemovingSelf && !isRequesterOwner && !isRequesterAdmin) {
      throw new Error("Only organization owners and admins can remove members");
    }

    const isOwnerLeaving = targetMembership.role === "owner";

    if (isOwnerLeaving) {
      const activeMembers = await ctx.db
        .query("organizationMember")
        .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
        .filter((q) => q.eq(q.field("revokedAt"), undefined))
        .collect();

      if (activeMembers.length > 1) {
        // NOTE: MVP: owner transfer disabled - owner cannot leave while other members exist
        throw new Error(
          "As the organization owner, you cannot leave while other members exist. Please remove all members first or delete the organization.",
        );
      }

      const activeProjects = await ctx.db
        .query("project")
        .withIndex("by_owner", (q) =>
          q.eq("ownerType", "organization").eq("ownerId", args.organizationId),
        )
        .filter((q) => q.eq(q.field("isArchived"), false))
        .first();

      if (activeProjects) {
        throw new Error(
          "Cannot delete organization with active projects. Please archive or delete all projects first.",
        );
      }

      await checkRateLimit(ctx, "write", args.organizationId);

      const now = Date.now();

      await ctx.db.patch(targetMembership._id, {
        revokedAt: now,
        revokedBy: ctx.userId,
        revocationReason: args.reason,
      });

      await ctx.db.delete(settings._id);

      await autumn.track(ctx, {
        entityId: args.organizationId,
        featureId: "members",
        value: -1,
      });

      return {
        success: true,
        shouldRotateKey: false,
        message: "Organization deleted successfully.",
        organizationDeleted: true,
      };
    }

    // NOTE: non-owner removal (permissions already checked above)
    await checkRateLimit(ctx, "write", args.organizationId);

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
    await checkOrganizationSuspended(ctx, args.organizationId);

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
    await checkOrganizationSuspended(ctx, args.organizationId);

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

    const paymentStatus = await getOrganizationPaymentStatus(ctx, args.organizationId);

    return {
      organizationId: settings.organizationId,
      currentKeyVersion: settings.currentKeyVersion,
      isFreeWithProPlan: settings.isFreeWithProPlan,
      userRole: membership.role,
      userWrappedOrgKey: membership.wrappedOrgKey,
      userKeyVersion: membership.keyVersion,
      needsKeyRotation: membership.keyVersion < settings.currentKeyVersion,
      paymentStatus: paymentStatus.status,
      paymentWarning: paymentStatus.warning,
      daysRemaining: paymentStatus.daysRemaining,
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
    await checkOrganizationSuspended(ctx, args.organizationId);

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

    await checkRateLimit(ctx, "keyRotation", args.organizationId);

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

export const checkAllSubscriptionStatus = internalMutation({
  args: {},
  handler: async (ctx) => {
    const allOrgs = await ctx.db.query("organizationSetting").collect();
    const now = Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    for (const org of allOrgs) {
      // NOTE: skip free orgs - they remain active indefinitely once created
      // NOTE: the freeOrganizationUsed flag prevents users from creating multiple free orgs
      if (org.isFreeWithProPlan) {
        continue;
      }

      const ownership = await ctx.db
        .query("organizationMember")
        .withIndex("by_organization", (q) => q.eq("organizationId", org.organizationId))
        .filter((q) => q.eq(q.field("role"), "owner"))
        .first();

      if (!ownership) {
        continue;
      }

      const owner = await ctx.db.get(ownership.userId);

      if (!owner) {
        continue;
      }

      const localAutumnInstance = initLocalAutumn({
        customerId: owner.authId,
        customerData: {
          name: owner.name,
          email: owner.email,
        },
      });

      // NOTE: for paid orgs, check subscription status
      const orgCheck = await localAutumnInstance.check(ctx, {
        entityId: org.organizationId,
        featureId: "organization_projects",
      });
      const isActive = orgCheck.data?.allowed || false;

      if (isActive) {
        // NOTE: subscription is active - restore if needed
        if (org.subscriptionStatus !== "active") {
          await ctx.db.patch(org._id, {
            subscriptionStatus: "active",
            paymentLapsedAt: undefined,
            suspendedAt: undefined,
            updatedAt: now,
          });
        }
      } else {
        // NOTE: subscription is not active - handle grace period and suspension
        if (org.subscriptionStatus === "active") {
          // NOTE: payment failed - start 7-day grace period
          await ctx.db.patch(org._id, {
            subscriptionStatus: "payment_lapsed",
            paymentLapsedAt: now,
            updatedAt: now,
          });
        } else if (org.subscriptionStatus === "payment_lapsed") {
          // NOTE: check if 7 days have passed
          if (org.paymentLapsedAt && now - org.paymentLapsedAt >= sevenDaysMs) {
            await ctx.db.patch(org._id, {
              subscriptionStatus: "suspended",
              suspendedAt: now,
              updatedAt: now,
            });
          }
        }
      }
    }

    return { success: true, checkedOrgs: allOrgs.length };
  },
});
