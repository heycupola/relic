import { v } from "convex/values";
import { components } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { deviceAuthError } from "./lib/errors";
import { protectedMutation } from "./lib/middleware";
import { checkRateLimit } from "./lib/rateLimit";
import type { ProtectedMutationCtx } from "./lib/types";

export const requestDeviceCode = mutation({
  args: {
    clientId: v.optional(v.string()),
    scope: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await checkRateLimit(ctx, "write", "device-auth-request");

    const {
      device_code,
      expires_in,
      interval,
      user_code,
      verification_uri,
      verification_uri_complete,
    } = await ctx.runMutation(components.betterAuth.deviceAuth.requestDeviceCode, {
      clientId: args.clientId,
      scope: args.scope,
    });

    return {
      device_code,
      user_code,
      verification_uri,
      verification_uri_complete,
      expires_in,
      interval,
    };
  },
});

export const pollDeviceToken = mutation({
  args: {
    device_code: v.string(),
  },
  handler: async (ctx, args) => {
    await checkRateLimit(ctx, "write", args.device_code);

    const { expires_in, session_token, token_type } = await ctx.runMutation(
      components.betterAuth.deviceAuth.pollDeviceToken,
      {
        device_code: args.device_code,
      },
    );

    return {
      session_token,
      token_type,
      expires_in,
    };
  },
});

export const getDeviceCodeInfo = query({
  args: {
    user_code: v.string(),
  },
  handler: async (ctx, args) => {
    await checkRateLimit(ctx, "read");

    const deviceCodeEntry = await ctx.runQuery(components.betterAuth.deviceAuth.getDeviceCodeInfo, {
      user_code: args.user_code,
    });

    if (!deviceCodeEntry) {
      throw deviceAuthError("not_found");
    }

    return {
      userCode: deviceCodeEntry.userCode,
      clientId: deviceCodeEntry.clientId,
      scope: deviceCodeEntry.scope,
      status: deviceCodeEntry.status,
    };
  },
});

export const approveDeviceCode = protectedMutation({
  args: {
    user_code: v.string(),
  },
  handler: async (ctx: ProtectedMutationCtx, args: { user_code: string }) => {
    await checkRateLimit(ctx, "write");

    await ctx.runMutation(components.betterAuth.deviceAuth.approveDeviceCode, {
      userId: ctx.userId,
      user_code: args.user_code,
    });

    return { success: true };
  },
});

export const denyDeviceCode = protectedMutation({
  args: {
    user_code: v.string(),
  },
  handler: async (ctx: ProtectedMutationCtx, args: { user_code: string }) => {
    await checkRateLimit(ctx, "write");

    await ctx.runMutation(components.betterAuth.deviceAuth.denyDeviceCode, {
      user_code: args.user_code,
    });

    return { success: true };
  },
});
