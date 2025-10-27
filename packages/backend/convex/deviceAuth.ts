import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import { protectedMutation } from "./lib/middleware";
import { checkRateLimit } from "./lib/rateLimit";
import type { ProtectedMutationCtx } from "./lib/types";

function generateSecureDeviceCode(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function generateSecureUserCode(length: number = 8): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  const randomBytes = new Uint8Array(length);
  crypto.getRandomValues(randomBytes);

  for (let i = 0; i < length; i++) {
    const byte = randomBytes[i];
    if (byte !== undefined) {
      code += chars[byte % chars.length];
    }
  }

  return code.match(/.{1,4}/g)?.join("-") || code;
}

export const createSessionForDevice = internalMutation({
  args: {
    sessionToken: v.string(),
    authId: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.runMutation(components.betterAuth.adapter.create, {
      input: {
        model: "session",
        data: {
          token: args.sessionToken,
          userId: args.authId,
          expiresAt: args.expiresAt,
          createdAt: now,
          updatedAt: now,
        },
      },
    });
  },
});

export const requestDeviceCode = mutation({
  args: {
    clientId: v.optional(v.string()),
    scope: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await checkRateLimit(ctx, "write", "device-auth-request");

    const deviceCode = generateSecureDeviceCode();
    const userCode = generateSecureUserCode(8);
    const now = Date.now();
    const expiresIn = 30 * 60 * 1000;
    const pollingInterval = 5 * 1000;

    await ctx.db.insert("deviceCode", {
      deviceCode,
      userCode,
      clientId: args.clientId,
      scope: args.scope,
      status: "pending",
      expiresAt: now + expiresIn,
      pollingInterval,
      createdAt: now,
      updatedAt: now,
    });

    const verificationUri = `${process.env.SITE_URL}/auth/device`;

    return {
      device_code: deviceCode,
      user_code: userCode,
      verification_uri: verificationUri,
      verification_uri_complete: `${verificationUri}?user_code=${userCode}`,
      expires_in: Math.floor(expiresIn / 1000),
      interval: Math.floor(pollingInterval / 1000),
    };
  },
});

export const pollDeviceToken = mutation({
  args: {
    device_code: v.string(),
  },
  handler: async (ctx, args) => {
    await checkRateLimit(ctx, "write", args.device_code);

    const deviceCodeEntry = await ctx.db
      .query("deviceCode")
      .withIndex("by_device_code", (q) => q.eq("deviceCode", args.device_code))
      .first();

    if (!deviceCodeEntry) {
      throw new Error("invalid_grant");
    }

    const now = Date.now();

    if (now > deviceCodeEntry.expiresAt) {
      await ctx.db.delete(deviceCodeEntry._id);
      throw new Error("expired_token");
    }

    if (deviceCodeEntry.status === "pending") {
      throw new Error("authorization_pending");
    }

    if (deviceCodeEntry.status === "denied") {
      await ctx.db.delete(deviceCodeEntry._id);
      throw new Error("access_denied");
    }

    if (!deviceCodeEntry.userId) {
      throw new Error("invalid_grant");
    }

    const user = await ctx.db.get(deviceCodeEntry.userId);
    if (!user) {
      throw new Error("invalid_grant");
    }

    await ctx.db.delete(deviceCodeEntry._id);

    const sessionToken = generateSecureDeviceCode();
    const sessionExpiresAt = now + 30 * 24 * 60 * 60 * 1000;

    await ctx.runMutation(internal.deviceAuth.createSessionForDevice, {
      sessionToken,
      authId: user.authId,
      expiresAt: sessionExpiresAt,
    });

    return {
      access_token: sessionToken,
      token_type: "Bearer",
      expires_in: 30 * 24 * 60 * 60,
      user: {
        id: user._id,
        authId: user.authId,
        email: user.email,
        name: user.name,
      },
    };
  },
});

export const getDeviceCodeInfo = query({
  args: {
    user_code: v.string(),
  },
  handler: async (ctx, args) => {
    await checkRateLimit(ctx, "read", args.user_code);

    const deviceCodeEntry = await ctx.db
      .query("deviceCode")
      .withIndex("by_user_code", (q) => q.eq("userCode", args.user_code))
      .first();

    if (!deviceCodeEntry) {
      return null;
    }

    const now = Date.now();
    if (now > deviceCodeEntry.expiresAt) {
      return null;
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
    const deviceCodeEntry = await ctx.db
      .query("deviceCode")
      .withIndex("by_user_code", (q) => q.eq("userCode", args.user_code))
      .first();

    if (!deviceCodeEntry) {
      throw new Error("Invalid user code");
    }

    const now = Date.now();
    if (now > deviceCodeEntry.expiresAt) {
      await ctx.db.delete(deviceCodeEntry._id);
      throw new Error("Code expired");
    }

    if (deviceCodeEntry.status !== "pending") {
      throw new Error("Code already processed");
    }

    await checkRateLimit(ctx, "write");

    await ctx.db.patch(deviceCodeEntry._id, {
      userId: ctx.userId,
      status: "approved",
      updatedAt: now,
    });

    return { success: true };
  },
});

export const denyDeviceCode = protectedMutation({
  args: {
    user_code: v.string(),
  },
  handler: async (ctx: ProtectedMutationCtx, args: { user_code: string }) => {
    const deviceCodeEntry = await ctx.db
      .query("deviceCode")
      .withIndex("by_user_code", (q) => q.eq("userCode", args.user_code))
      .first();

    if (!deviceCodeEntry) {
      throw new Error("Invalid user code");
    }

    const now = Date.now();
    if (now > deviceCodeEntry.expiresAt) {
      await ctx.db.delete(deviceCodeEntry._id);
      throw new Error("Code expired");
    }

    await checkRateLimit(ctx, "write");

    await ctx.db.patch(deviceCodeEntry._id, {
      status: "denied",
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

export const cleanupExpiredDeviceCodes = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const expiredCodes = await ctx.db
      .query("deviceCode")
      .withIndex("by_expires", (q) => q.lt("expiresAt", now))
      .collect();

    let deleted = 0;
    for (const code of expiredCodes) {
      await ctx.db.delete(code._id);
      deleted++;
    }

    return { success: true, deleted };
  },
});
