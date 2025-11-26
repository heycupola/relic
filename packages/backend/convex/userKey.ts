import { ConvexError, v } from "convex/values";
import { components } from "./_generated/api";
import type { Id as BetterAuthId } from "./betterAuth/_generated/dataModel";
import { protectedMutation, protectedQuery } from "./lib/middleware";
import { checkRateLimit } from "./lib/rateLimit";
import { ErrorSeverity, type ProtectedMutationCtx, type ProtectedQueryCtx } from "./lib/types";

enum OrgRewrapRequestStatus {
  Completed = "completed",
  Pending = "pending",
  Canceled = "canceled",
}

export const setKeysAndSalt = protectedMutation({
  args: {
    publicKey: v.string(),
    encryptedPrivateKey: v.string(),
    salt: v.string(),
  },
  handler: async (ctx: ProtectedMutationCtx, args) => {
    const user = await ctx.runQuery(components.betterAuth.user.loadUserById, {
      userId: ctx.userId,
    });

    let needsEncryptionForPersonalProjectSecrets: boolean | null | undefined;
    let rewrapRequired = false;

    if (user.publicKey && user.publicKey !== args.publicKey) {
      // NOTE: user's organization member keys require rewrapping
      rewrapRequired = true;
    }

    if (user.salt !== args.salt) {
      // NOTE: needsEncryption
      needsEncryptionForPersonalProjectSecrets = true;
    }

    await checkRateLimit(ctx, "write");

    await ctx.runMutation(components.betterAuth.user.setKeysAndSalt, {
      userId: ctx.userId,
      publicKey: args.publicKey,
      encryptedPrivateKey: args.encryptedPrivateKey,
      salt: args.salt,
      needsEncryptionForPersonalProjectSecrets,
    });

    if (rewrapRequired) {
      const { organizations, memberships } = await ctx.runQuery(
        components.betterAuth.organization.loadOrganizationsByUserId,
        {
          userId: ctx.userId,
        },
      );

      if (organizations && memberships) {
        for (const [index, org] of organizations.entries()) {
          const membership = memberships[index];

          if (membership?.organizationId !== org._id) {
            console.error("Membership org id and the org id didn't match");
            continue;
          }

          const existingRequest = await ctx.db
            .query("orgKeyRewrapRequest")
            .withIndex("by_org_and_requester", (q) =>
              q
                .eq("organizationId", org._id as BetterAuthId<"organization">)
                .eq("requesterId", ctx.userId)
                .eq("status", OrgRewrapRequestStatus.Pending),
            )
            .first();

          if (existingRequest) continue;

          await ctx.db.insert("orgKeyRewrapRequest", {
            organizationId: org._id as BetterAuthId<"organization">,
            receiverId: org.ownerId as BetterAuthId<"user">,
            requesterId: ctx.userId as BetterAuthId<"user">,
            requestedAt: Date.now(),
            status: OrgRewrapRequestStatus.Pending,
            orgMemberId: membership._id as BetterAuthId<"member">,
          });
        }
      }
    }

    return { success: true };
  },
});

export const hasUserKeys = protectedQuery({
  args: {},
  handler: async (ctx: ProtectedQueryCtx) => {
    const user = await ctx.runQuery(components.betterAuth.user.loadUserById, {
      userId: ctx.userId,
    });

    return { hasKeys: user.publicKey !== undefined && user.encryptedPrivateKey !== undefined };
  },
});

export const loadPendingOrgKeyRewrapRequests = protectedQuery({
  args: {},
  handler: async (ctx, _args) => {
    const requests = await ctx.db
      .query("orgKeyRewrapRequest")
      .withIndex("by_receiver", (q) =>
        q.eq("receiverId", ctx.userId).eq("status", OrgRewrapRequestStatus.Pending),
      )
      .collect();

    return { success: true, requests };
  },
});

export const completeOrgKeyRewrapRequest = protectedMutation({
  args: {
    requestId: v.id("orgKeyRewrapRequest"),
    wrappedOrgKey: v.string(),
  },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId);

    if (!request) {
      throw new ConvexError({
        code: "REQUEST_NOT_FOUND",
        message: "Unable to find the request",
        severity: ErrorSeverity.Low,
      });
    }

    if (request.receiverId !== ctx.userId) {
      throw new ConvexError({
        code: "WRONG_RECEIVER",
        message: "You're not the request receiver",
        severity: ErrorSeverity.Low,
      });
    }

    const org = await ctx.runQuery(components.betterAuth.organization.loadOrganizationById, {
      organizationId: request.organizationId,
    });

    if (!org) {
      throw new ConvexError({
        code: "ORG_NOT_FOUND",
        message: "Organization not found",
        severity: ErrorSeverity.High,
      });
    }

    if (org.ownerId !== ctx.userId) {
      throw new ConvexError({
        code: "NOT_ORG_OWNER",
        message: "Only organization owner can complete rewrap requests",
        severity: ErrorSeverity.High,
      });
    }

    await ctx.runMutation(components.betterAuth.member.setMemberKey, {
      memberId: request.orgMemberId,
      newKeyVersion: org.currentKeyVersion,
      wrappedOrgKey: args.wrappedOrgKey,
    });

    await ctx.db.patch(request._id, {
      status: OrgRewrapRequestStatus.Completed,
    });

    return { success: true, requestId: request._id };
  },
});

export const cancelOrgKeyRewrapRequest = protectedMutation({
  args: {
    requestId: v.id("orgKeyRewrapRequest"),
  },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId);

    if (!request) {
      throw new ConvexError({
        code: "REQUEST_NOT_FOUND",
        message: "Unable to find the request",
        severity: ErrorSeverity.Low,
      });
    }

    if (request.status !== OrgRewrapRequestStatus.Pending) {
      throw new ConvexError({
        code: "UNABLE_TO_CANCEL",
        message: "The request has either accepted or canceled before",
        severity: ErrorSeverity.Low,
      });
    }

    if (request.receiverId !== ctx.userId) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Only receiver can cancel",
        severity: ErrorSeverity.High,
      });
    }

    await ctx.db.patch(request._id, {
      status: OrgRewrapRequestStatus.Canceled,
    });

    return { success: true, requestId: request._id };
  },
});
