import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, mutation, query } from "./_generated/server";
import { ErrorSeverity } from "./lib/types";

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

export const requestDeviceCode = mutation({
  args: {
    clientId: v.optional(v.string()),
    scope: v.optional(v.string()),
  },
  returns: v.object({
    device_code: v.string(),
    user_code: v.string(),
    verification_uri: v.string(),
    verification_uri_complete: v.string(),
    expires_in: v.number(),
    interval: v.number(),
  }),
  handler: async (ctx, args) => {
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
    });

    const verificationUri = `${process.env.SITE_URL}/oauth/authorize`;

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
  returns: v.object({
    session_token: v.string(),
    token_type: v.string(),
    expires_in: v.number(),
  }),
  handler: async (ctx, args) => {
    const deviceCodeEntry = await ctx.db
      .query("deviceCode")
      .withIndex("by_deviceCode", (q) => q.eq("deviceCode", args.device_code))
      .first();

    if (!deviceCodeEntry) {
      throw new ConvexError({
        code: "INVALID_GRANT",
        message: "Invalid device code",
        severity: ErrorSeverity.High,
      });
    }

    const now = Date.now();

    if (now > deviceCodeEntry.expiresAt) {
      await ctx.db.delete(deviceCodeEntry._id);

      throw new ConvexError({
        code: "EXPIRED_TOKEN",
        message: "Token has expired",
        severity: ErrorSeverity.High,
      });
    }

    if (deviceCodeEntry.lastPolledAt) {
      const timeSinceLastPoll = now - deviceCodeEntry.lastPolledAt;
      const pollingInterval = deviceCodeEntry.pollingInterval || 5000;

      if (timeSinceLastPoll < pollingInterval) {
        throw new ConvexError({
          code: "SLOW_DOWN",
          message: "Polling too frequently. Please slow down.",
          severity: ErrorSeverity.Medium,
        });
      }
    }

    await ctx.db.patch(deviceCodeEntry._id, {
      lastPolledAt: now,
    });

    if (deviceCodeEntry.status === "pending") {
      throw new ConvexError({
        code: "AUTHORIZATION_PENDING",
        message: "Authorization is pending",
        severity: ErrorSeverity.High,
      });
    }

    if (deviceCodeEntry.status === "denied") {
      await ctx.db.delete(deviceCodeEntry._id);
      throw new ConvexError({
        code: "ACCESS_DENIED",
        message: "Access denied",
        severity: ErrorSeverity.High,
      });
    }

    if (!deviceCodeEntry.userId) {
      throw new ConvexError({
        code: "INVALID_GRANT",
        message: "Invalid grant",
        severity: ErrorSeverity.High,
      });
    }

    const user = await ctx.db.get(deviceCodeEntry.userId as Id<"user">);

    if (!user) {
      throw new ConvexError({
        code: "INVALID_USER",
        message: "Invalid grant",
        severity: ErrorSeverity.High,
      });
    }

    await ctx.db.delete(deviceCodeEntry._id);

    const sessionToken = generateSecureDeviceCode();
    const sessionExpiresAt = now + 30 * 24 * 60 * 60 * 1000;

    await ctx.db.insert("session", {
      token: sessionToken,
      userId: user._id,
      expiresAt: sessionExpiresAt,
      createdAt: now,
      updatedAt: now,
    });

    return {
      session_token: sessionToken,
      token_type: "Bearer",
      expires_in: 30 * 24 * 60 * 60,
    };
  },
});

export const getDeviceCodeInfo = query({
  args: {
    user_code: v.string(),
  },
  returns: v.union(
    v.null(),
    v.object({
      userCode: v.string(),
      clientId: v.optional(v.string()),
      scope: v.optional(v.string()),
      status: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const deviceCodeEntry = await ctx.db
      .query("deviceCode")
      .withIndex("by_userCode", (q) => q.eq("userCode", args.user_code))
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
      clientId: deviceCodeEntry.clientId ?? undefined,
      scope: deviceCodeEntry.scope ?? undefined,
      status: deviceCodeEntry.status,
    };
  },
});

// NOTE: use this as a protected mutation
export const approveDeviceCode = mutation({
  args: {
    user_code: v.string(),
    userId: v.id("user"),
  },
  returns: v.object({
    success: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const deviceCodeEntry = await ctx.db
      .query("deviceCode")
      .withIndex("by_userCode", (q) => q.eq("userCode", args.user_code))
      .first();

    if (!deviceCodeEntry) {
      throw new ConvexError({
        code: "INVALID_USER_CODE",
        message: "Invalid user code",
        severity: ErrorSeverity.High,
      });
    }

    const now = Date.now();
    if (now > deviceCodeEntry.expiresAt) {
      await ctx.db.delete(deviceCodeEntry._id);
      throw new ConvexError({
        code: "CODE_EXPIRED",
        message: "Device code has expired",
        severity: ErrorSeverity.High,
      });
    }

    if (deviceCodeEntry.status !== "pending") {
      throw new ConvexError({
        code: "CODE_ALREADY_PROCESSED",
        message: "Device code has already been processed",
        severity: ErrorSeverity.High,
      });
    }

    await ctx.db.patch(deviceCodeEntry._id, {
      userId: args.userId,
      status: "approved",
    });

    return { success: true };
  },
});

// NOTE: use this as a protected mutation
export const denyDeviceCode = mutation({
  args: {
    user_code: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
  }),
  handler: async (ctx, args: { user_code: string }) => {
    const deviceCodeEntry = await ctx.db
      .query("deviceCode")
      .withIndex("by_userCode", (q) => q.eq("userCode", args.user_code))
      .first();

    if (!deviceCodeEntry) {
      throw new ConvexError({
        code: "INVALID_USER_CODE",
        message: "Invalid user code",
        severity: ErrorSeverity.High,
      });
    }

    const now = Date.now();
    if (now > deviceCodeEntry.expiresAt) {
      await ctx.db.delete(deviceCodeEntry._id);
      throw new ConvexError({
        code: "CODE_EXPIRED",
        message: "Device code has expired",
        severity: ErrorSeverity.High,
      });
    }

    await ctx.db.patch(deviceCodeEntry._id, {
      status: "denied",
    });

    return { success: true };
  },
});

export const _cleanupExpiredDeviceCodes = internalMutation({
  args: {},
  returns: v.object({
    success: v.boolean(),
    deleted: v.number(),
  }),
  handler: async (ctx) => {
    const now = Date.now();
    const expiredCodes = await ctx.db
      .query("deviceCode")
      .withIndex("by_expiresAt", (q) => q.lt("expiresAt", now))
      .collect();

    let deleted = 0;
    for (const code of expiredCodes) {
      await ctx.db.delete(code._id);
      deleted++;
    }

    return { success: true, deleted };
  },
});
