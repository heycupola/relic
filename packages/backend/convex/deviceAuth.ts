import { v } from "convex/values";
import { components } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { deviceAuthError } from "./lib/errors";
import { createLogger } from "./lib/logger";
import { protectedMutation } from "./lib/middleware";
import { checkRateLimit } from "./lib/rateLimit";
import type { ProtectedMutationCtx } from "./lib/types";

const log = createLogger("deviceAuth");

const SITE_URL =
  process.env.SITE_URL ||
  (process.env.ENVIRONMENT === "development" ? "http://localhost:3000" : "https://relic.so");

export const requestDeviceCode = mutation({
  args: {
    clientId: v.optional(v.string()),
    scope: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await checkRateLimit(ctx, "write", "device-auth-request");

    const result = await ctx.runMutation(components.betterAuth.deviceAuth.requestDeviceCode, {
      clientId: args.clientId,
      scope: args.scope,
    });

    const verificationUri = `${SITE_URL}/oauth/authorize`;

    return {
      device_code: result.device_code,
      user_code: result.user_code,
      verification_uri: verificationUri,
      verification_uri_complete: `${verificationUri}?user_code=${result.user_code}`,
      expires_in: result.expires_in,
      interval: result.interval,
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
    const deviceCodeEntry = await ctx.runQuery(components.betterAuth.deviceAuth.getDeviceCodeInfo, {
      user_code: args.user_code,
    });

    // NOTE: This throws instead of returning null. The component's getDeviceCodeInfo
    // already returns null for not-found/expired cases, so ideally this wrapper should
    // pass null through. The web authorize page (oauth/authorize) has a `=== null` check
    // that is currently dead code because of this throw — the ErrorBoundary catches it
    // instead. Changing this to return null would require updating 3 tests in
    // device-auth-flow.test.ts (expectConvexError → toBeNull). Low priority.
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

    log.info("Device code approved", { userId: ctx.userId, userCode: args.user_code });

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

    log.info("Device code denied", { userId: ctx.userId, userCode: args.user_code });

    return { success: true };
  },
});
