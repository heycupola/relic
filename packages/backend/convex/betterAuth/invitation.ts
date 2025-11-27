import { v } from "convex/values";
import {
  alreadyExistsError,
  createError,
  ErrorCode,
  notFoundError,
  permissionError,
} from "../lib/errors";
import { ErrorSeverity } from "../lib/types.ts";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation } from "./_generated/server";
import { InvitationStatus, OrgRole } from "./lib/types.ts";

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
      throw notFoundError("organization");
    }

    const invitee = await ctx.db
      .query("user")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();

    if (!invitee) {
      throw notFoundError("user");
    }

    if (args.inviterId === invitee._id) {
      throw createError({
        code: ErrorCode.INVALID_OPERATION,
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
      throw alreadyExistsError("member");
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
      throw createError({
        code: ErrorCode.INVITATION_ALREADY_PENDING,
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
      throw permissionError("invite members to this organization", ErrorSeverity.High);
    }

    await ctx.db.insert("invitation", {
      email: args.email,
      inviterId: args.inviterId,
      organizationId: args.organizationId,
      status: InvitationStatus.Pending,
      role: args.role,
      expiresAt: now + sevenDays,
    });

    if (member && member.revokedAt !== null && member.revokedAt !== undefined) {
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
      throw notFoundError("invitation");
    }

    if (invitation.email !== args.inviteeEmail) {
      throw createError({
        code: ErrorCode.INVALID_ARGUMENTS,
        message: "Wrong invitee email",
        severity: ErrorSeverity.High,
      });
    }

    if (invitation.status !== InvitationStatus.Pending) {
      throw createError({
        code: ErrorCode.INVALID_RESOURCE_STATE,
        message: "Invalid invitation",
        severity: ErrorSeverity.High,
      });
    }

    const organization = await ctx.db.get(invitation.organizationId as Id<"organization">);

    if (!organization) {
      throw notFoundError("organization");
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
        throw notFoundError("member");
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
