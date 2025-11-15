import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation } from "./_generated/server";
import { ErrorSeverity, InvitationStatus, OrgRole } from "./lib/types.ts";

export const inviteMember = mutation({
  args: {
    inviterRole: v.union(
      v.literal(OrgRole.Owner),
      v.literal(OrgRole.Admin),
      v.literal(OrgRole.Member),
      v.literal(OrgRole.Viewer),
    ),
    inviterId: v.id("user"),
    organizationId: v.id("organization"),
    email: v.string(),
    role: v.union(v.literal(OrgRole.Admin), v.literal(OrgRole.Member), v.literal(OrgRole.Viewer)),
    wrappedOrgKey: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
  }),
  handler: async (ctx: MutationCtx, args) => {
    const organization = await ctx.db
      .query("organization")
      .withIndex("by_id", (q) => q.eq("_id", args.organizationId))
      .first();

    if (!organization) {
      throw new ConvexError({
        code: "ORGANIZATION_NOT_FOUND",
        message: "Organization not found",
        severity: ErrorSeverity.High,
      });
    }

    const invitee = await ctx.db
      .query("user")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();

    if (!invitee) {
      throw new ConvexError({
        code: "INVITEE_NOT_FOUND",
        message: "Invitee not found",
        severity: ErrorSeverity.High,
      });
    }

    if (args.inviterId === invitee._id) {
      throw new ConvexError({
        code: "CANNOT_INVITE_YOURSELF",
        message: "You cannot invite yourself",
        severity: ErrorSeverity.High,
      });
    }

    const member = await ctx.db
      .query("member")
      .withIndex("organizationId_userId", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", invitee._id),
      )
      .first();

    if (member && member.isPending === false && member.revokedAt === null) {
      throw new ConvexError({
        code: "INVITEE_ALREADY_MEMBER",
        message: "Invitee is already an active member of the organization",
        severity: ErrorSeverity.High,
      });
    }

    const now = Date.now();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;

    const existingPendingInvitation = await ctx.db
      .query("invitation")
      .withIndex("email_organizationId_status", (q) =>
        q
          .eq("email", args.email)
          .eq("organizationId", args.organizationId)
          .eq("status", InvitationStatus.Pending),
      )
      .first();

    if (existingPendingInvitation && existingPendingInvitation.expiresAt > now) {
      throw new ConvexError({
        code: "INVITATION_ALREADY_PENDING",
        message: "This user already has a pending invitation",
        severity: ErrorSeverity.High,
      });
    } else {
      if (existingPendingInvitation) {
        await ctx.db.patch(existingPendingInvitation._id, {
          status: InvitationStatus.Expired,
        });
      }
    }

    if (args.inviterRole === OrgRole.Viewer || args.inviterRole === OrgRole.Member) {
      throw new ConvexError({
        code: "INSUFFICIENT_ROLE",
        message: "Only owners, and admins can invite members",
        severity: ErrorSeverity.High,
      });
    }

    await ctx.db.insert("invitation", {
      email: args.email,
      inviterId: args.inviterId,
      organizationId: args.organizationId,
      status: InvitationStatus.Pending,
      role: args.role,
      expiresAt: now + sevenDays,
    });

    if (member && !!member.revokedAt) {
      await ctx.db.patch(member._id, {
        wrappedOrgKey: args.wrappedOrgKey,
        keyVersion: organization.currentKeyVersion,
        isPending: true,
      });
    } else {
      await ctx.db.insert("member", {
        role: args.role,
        grantedBy: args.inviterId,
        organizationId: args.organizationId,
        userId: invitee._id,
        wrappedOrgKey: args.wrappedOrgKey,
        keyVersion: organization.currentKeyVersion,
        createdAt: now,
        isPending: true,
      });
    }

    return { success: true };
  },
});

export const acceptOrCancelInvitation = mutation({
  args: {
    inviteeId: v.id("user"),
    inviteeEmail: v.string(),
    invitationId: v.id("invitation"),
    accepting: v.boolean(),
  },
  returns: v.object({
    success: v.boolean(),
    expired: v.boolean(),
  }),
  handler: async (ctx: MutationCtx, args) => {
    const invitation = await ctx.db.get(args.invitationId);

    if (!invitation) {
      throw new ConvexError({
        code: "INVITATION_NOT_FOUND",
        message: "Invitation not found",
        severity: ErrorSeverity.High,
      });
    }

    if (invitation.email !== args.inviteeEmail) {
      throw new ConvexError({
        code: "WRONG_INVITEE",
        message: "Wrong invitee email",
        severity: ErrorSeverity.High,
      });
    }

    if (invitation.status !== InvitationStatus.Pending) {
      throw new ConvexError({
        code: "INVALID_INVITATION",
        message: "Invalid invitation",
        severity: ErrorSeverity.High,
      });
    }

    const organization = await ctx.db.get(invitation.organizationId as Id<"organization">);

    if (!organization) {
      throw new ConvexError({
        code: "INVALID_ORGANIZATION",
        message: "Invalid organization",
        severity: ErrorSeverity.High,
      });
    }

    const now = Date.now();

    if (now > invitation.expiresAt) {
      await ctx.db.patch(args.invitationId, {
        status: InvitationStatus.Expired,
      });

      return { success: false, expired: true };
    }

    if (args.accepting) {
      await ctx.db.patch(args.invitationId, {
        status: InvitationStatus.Accepted,
      });

      // TODO: check on the app component if the organization has enough
      // available member slots before adding the new member
      // NOTE: adds the user as a member of the organization

      const member = await ctx.db
        .query("member")
        .withIndex("organizationId_userId", (q) =>
          q.eq("organizationId", organization._id).eq("userId", args.inviteeId),
        )
        .first();

      if (!member) {
        throw new ConvexError({
          code: "UNABLE_TO_MATCH_MEMBER",
          message: "Member wasn't matched",
          severity: ErrorSeverity.High,
        });
      }
      await ctx.db.patch(member._id, {
        isPending: false,
        revokedAt: null,
        revocationReason: null,
      });
    } else {
      await ctx.db.patch(args.invitationId, {
        status: InvitationStatus.Canceled,
      });

      const member = await ctx.db
        .query("member")
        .withIndex("organizationId_userId", (q) =>
          q.eq("organizationId", organization._id).eq("userId", args.inviteeId),
        )
        .first();

      if (member && member.isPending === true) {
        await ctx.db.delete(member._id);
      }
    }

    return { success: true, expired: false };
  },
});
