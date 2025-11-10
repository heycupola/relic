import { v } from "convex/values";
import { convexTest, type TestConvex } from "convex-test";
import { beforeEach, describe, it } from "vitest";
import { api, internal } from "../_generated/api";
import { internalMutation } from "../_generated/server";
import schema from "../schema";
import { getTestUsers, type TestUser } from "./helpers/setup";

let modules = import.meta.glob("../**/*.ts");

vi.mock("../rateLimiter", () => ({
  rateLimiter: {
    limit: vi.fn().mockResolvedValue({ ok: true, retryAfter: 0 }),
    check: vi.fn().mockResolvedValue({ ok: true, retryAfter: 0 }),
    reset: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@convex-dev/rate-limiter/convex.config", () => ({
  default: {},
}));

const mockCreateSessionForDevice = internalMutation({
  args: {
    sessionToken: v.string(),
    authId: v.string(),
    expiresAt: v.number(),
  },
  handler: async () => {
    // NOTE: do nothing in tests to suppress the fucking better auth component
  },
});

describe("deviceAuth.ts", () => {
  let t: TestConvex<typeof schema>;
  let testUsers: Map<string, TestUser> = new Map();
  let user: TestUser;

  beforeEach(async () => {
    // Override deviceAuth module with mocked createSessionForDevice
    const modulesWithMock = {
      ...modules,
      "../deviceAuth.ts": async () => {
        const actual = (await modules["../deviceAuth.ts"]!()) as Object;
        return {
          ...actual,
          createSessionForDevice: mockCreateSessionForDevice,
        };
      },
    };

    t = convexTest(schema, modulesWithMock);
    testUsers = await getTestUsers(t);

    user = testUsers.get("user1")!;
  });

  describe("requestDeviceCode", () => {
    it("should request device code successfully", async () => {
      const result = await user.asUser.mutation(api.deviceAuth.requestDeviceCode, {
        clientId: "test-suite",
      });

      await t.run(async (ctx) => {
        const savedDeviceCode = await ctx.db
          .query("deviceCode")
          .withIndex("by_device_code", (q) => q.eq("deviceCode", result.device_code))
          .first();

        expect(savedDeviceCode).toBeDefined();
        expect(savedDeviceCode?.status).toBe("pending");
      });
    });
  });

  describe("pollDeviceToken", () => {
    it("should return authorization_pending when code is pending", async () => {
      const result = await user.asUser.mutation(api.deviceAuth.requestDeviceCode, {
        clientId: "test-suite",
      });

      await expect(
        user.asUser.mutation(api.deviceAuth.pollDeviceToken, {
          device_code: result.device_code,
        }),
      ).rejects.toThrow("authorization_pending");
    });

    it("should return invalid_grant for non-existent device code", async () => {
      await expect(
        user.asUser.mutation(api.deviceAuth.pollDeviceToken, {
          device_code: "invalid-code",
        }),
      ).rejects.toThrow("invalid_grant");
    });

    it("should return expired_token for expired code", async () => {
      const result = await user.asUser.mutation(api.deviceAuth.requestDeviceCode, {
        clientId: "test-suite",
      });

      await t.run(async (ctx) => {
        const deviceCode = await ctx.db
          .query("deviceCode")
          .withIndex("by_device_code", (q) => q.eq("deviceCode", result.device_code))
          .first();

        if (deviceCode) {
          await ctx.db.patch(deviceCode._id, {
            expiresAt: Date.now() - 1000,
          });
        }
      });

      await expect(
        user.asUser.mutation(api.deviceAuth.pollDeviceToken, {
          device_code: result.device_code,
        }),
      ).rejects.toThrow("expired_token");
    });

    it("should return access_denied when code is denied", async () => {
      const result = await user.asUser.mutation(api.deviceAuth.requestDeviceCode, {
        clientId: "test-suite",
      });

      await user.asUser.mutation(api.deviceAuth.denyDeviceCode, {
        user_code: result.user_code,
      });

      await expect(
        user.asUser.mutation(api.deviceAuth.pollDeviceToken, {
          device_code: result.device_code,
        }),
      ).rejects.toThrow("access_denied");
    });

    it("should return access token when code is approved", async () => {
      const result = await user.asUser.mutation(api.deviceAuth.requestDeviceCode, {
        clientId: "test-suite",
      });

      await user.asUser.mutation(api.deviceAuth.approveDeviceCode, {
        user_code: result.user_code,
      });

      // await new Promise((resolve) => setTimeout(resolve, 5100));

      const token = await user.asUser.mutation(api.deviceAuth.pollDeviceToken, {
        device_code: result.device_code,
      });

      expect(token.session_token).toBeDefined();
      expect(token.token_type).toBe("Bearer");
      expect(token.expires_in).toBe(30 * 24 * 60 * 60);
    });
  });

  describe("getDeviceCodeInfo", () => {
    it("should return device code info for valid user code", async () => {
      const result = await user.asUser.mutation(api.deviceAuth.requestDeviceCode, {
        clientId: "test-suite",
        scope: "read:secrets",
      });

      const info = await user.asUser.query(api.deviceAuth.getDeviceCodeInfo, {
        user_code: result.user_code,
      });

      expect(info).toBeDefined();
      expect(info?.userCode).toBe(result.user_code);
      expect(info?.clientId).toBe("test-suite");
      expect(info?.scope).toBe("read:secrets");
      expect(info?.status).toBe("pending");
    });

    it("should return null for non-existent user code", async () => {
      const info = await user.asUser.query(api.deviceAuth.getDeviceCodeInfo, {
        user_code: "INVALID-CODE",
      });

      expect(info).toBeNull();
    });

    it("should return null for expired user code", async () => {
      const result = await user.asUser.mutation(api.deviceAuth.requestDeviceCode, {
        clientId: "test-suite",
      });

      await t.run(async (ctx) => {
        const deviceCode = await ctx.db
          .query("deviceCode")
          .withIndex("by_user_code", (q) => q.eq("userCode", result.user_code))
          .first();

        if (deviceCode) {
          await ctx.db.patch(deviceCode._id, {
            expiresAt: Date.now() - 1000,
          });
        }
      });

      const info = await user.asUser.query(api.deviceAuth.getDeviceCodeInfo, {
        user_code: result.user_code,
      });

      expect(info).toBeNull();
    });
  });

  describe("approveDeviceCode", () => {
    it("should approve device code successfully", async () => {
      const result = await user.asUser.mutation(api.deviceAuth.requestDeviceCode, {
        clientId: "test-suite",
      });

      const approval = await user.asUser.mutation(api.deviceAuth.approveDeviceCode, {
        user_code: result.user_code,
      });

      expect(approval.success).toBe(true);

      await t.run(async (ctx) => {
        const deviceCode = await ctx.db
          .query("deviceCode")
          .withIndex("by_user_code", (q) => q.eq("userCode", result.user_code))
          .first();

        expect(deviceCode?.status).toBe("approved");
        expect(deviceCode?.userId).toBe(user.userId);
      });
    });

    it("should reject invalid user code", async () => {
      await expect(
        user.asUser.mutation(api.deviceAuth.approveDeviceCode, {
          user_code: "INVALID-CODE",
        }),
      ).rejects.toThrow("Invalid user code");
    });

    it("should reject expired user code", async () => {
      const result = await user.asUser.mutation(api.deviceAuth.requestDeviceCode, {
        clientId: "test-suite",
      });

      await t.run(async (ctx) => {
        const deviceCode = await ctx.db
          .query("deviceCode")
          .withIndex("by_user_code", (q) => q.eq("userCode", result.user_code))
          .first();

        if (deviceCode) {
          await ctx.db.patch(deviceCode._id, {
            expiresAt: Date.now() - 1000,
          });
        }
      });

      await expect(
        user.asUser.mutation(api.deviceAuth.approveDeviceCode, {
          user_code: result.user_code,
        }),
      ).rejects.toThrow("Code expired");
    });

    it("should reject already processed code", async () => {
      const result = await user.asUser.mutation(api.deviceAuth.requestDeviceCode, {
        clientId: "test-suite",
      });

      await user.asUser.mutation(api.deviceAuth.approveDeviceCode, {
        user_code: result.user_code,
      });

      await expect(
        user.asUser.mutation(api.deviceAuth.approveDeviceCode, {
          user_code: result.user_code,
        }),
      ).rejects.toThrow("Code already processed");
    });
  });

  describe("denyDeviceCode", () => {
    it("should deny device code successfully", async () => {
      const result = await user.asUser.mutation(api.deviceAuth.requestDeviceCode, {
        clientId: "test-suite",
      });

      const denial = await user.asUser.mutation(api.deviceAuth.denyDeviceCode, {
        user_code: result.user_code,
      });

      expect(denial.success).toBe(true);

      await t.run(async (ctx) => {
        const deviceCode = await ctx.db
          .query("deviceCode")
          .withIndex("by_user_code", (q) => q.eq("userCode", result.user_code))
          .first();

        expect(deviceCode?.status).toBe("denied");
      });
    });

    it("should reject invalid user code", async () => {
      await expect(
        user.asUser.mutation(api.deviceAuth.denyDeviceCode, {
          user_code: "INVALID-CODE",
        }),
      ).rejects.toThrow("Invalid user code");
    });

    it("should reject expired user code", async () => {
      const result = await user.asUser.mutation(api.deviceAuth.requestDeviceCode, {
        clientId: "test-suite",
      });

      await t.run(async (ctx) => {
        const deviceCode = await ctx.db
          .query("deviceCode")
          .withIndex("by_user_code", (q) => q.eq("userCode", result.user_code))
          .first();

        if (deviceCode) {
          await ctx.db.patch(deviceCode._id, {
            expiresAt: Date.now() - 1000,
          });
        }
      });

      await expect(
        user.asUser.mutation(api.deviceAuth.denyDeviceCode, {
          user_code: result.user_code,
        }),
      ).rejects.toThrow("Code expired");
    });
  });

  describe("cleanupExpiredDeviceCodes", () => {
    it("should cleanup expired device codes", async () => {
      const result1 = await user.asUser.mutation(api.deviceAuth.requestDeviceCode, {
        clientId: "test-suite-1",
      });
      const result2 = await user.asUser.mutation(api.deviceAuth.requestDeviceCode, {
        clientId: "test-suite-2",
      });

      await t.run(async (ctx) => {
        const deviceCode1 = await ctx.db
          .query("deviceCode")
          .withIndex("by_device_code", (q) => q.eq("deviceCode", result1.device_code))
          .first();

        if (deviceCode1) {
          await ctx.db.patch(deviceCode1._id, {
            expiresAt: Date.now() - 1000,
          });
        }
      });

      const cleanup = await t.mutation(internal.deviceAuth.cleanupExpiredDeviceCodes, {});

      expect(cleanup.success).toBe(true);
      expect(cleanup.deleted).toBe(1);

      await t.run(async (ctx) => {
        const expiredCode = await ctx.db
          .query("deviceCode")
          .withIndex("by_device_code", (q) => q.eq("deviceCode", result1.device_code))
          .first();

        const validCode = await ctx.db
          .query("deviceCode")
          .withIndex("by_device_code", (q) => q.eq("deviceCode", result2.device_code))
          .first();

        expect(expiredCode).toBeNull();
        expect(validCode).toBeDefined();
      });
    });
  });
});
