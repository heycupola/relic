/// <reference types="vite/client" />

import type { GenericActionCtx } from "convex/server";
import { vi } from "vitest";
import type { DataModel } from "../convex/_generated/dataModel";

// Mock rate limiter modules
vi.mock("../convex/rateLimiter", () => ({
  rateLimiter: {
    limit: vi.fn(() => Promise.resolve({ ok: true, retryAfter: 0 })),
    check: vi.fn(() => Promise.resolve({ ok: true, retryAfter: 0 })),
    reset: vi.fn(() => Promise.resolve(undefined)),
  },
}));

vi.mock("../convex/lib/rateLimit", () => ({
  checkRateLimit: vi.fn(() => Promise.resolve()),
}));

vi.mock("@convex-dev/rate-limiter/convex.config", () => ({
  default: {},
}));

// Mock Resend SDK
vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: {
      send: vi.fn().mockResolvedValue({ data: { id: "mock-email-id" }, error: null }),
    },
  })),
}));

// Mock Resend component
vi.mock("../convex/resend", () => ({
  resendSdk: {
    emails: {
      send: vi.fn().mockResolvedValue({ data: { id: "mock-email-id" }, error: null }),
    },
  },
  resend: {
    sendEmailManually: vi.fn().mockResolvedValue("mock-email-id"),
  },
  sendEmail: vi.fn().mockResolvedValue({ emailId: "mock-email-id" }),
  getUpgradeUrl: vi.fn().mockReturnValue("https://relic.so/upgrade"),
  getDashboardUrl: vi.fn().mockReturnValue("https://relic.so/dashboard"),
}));

// Create the mock autumn in a hoisted block so it's available before vi.mock runs
const { _mockAutumn } = vi.hoisted(() => {
  // Inline minimal MockAutumn implementation for hoisting
  interface FeatureUsage {
    entityId?: string;
    featureId: string;
    type: "usage" | "boolean";
    limit: number;
    current: number;
    booleanValue?: boolean;
  }

  class MockAutumnInline {
    private features: Map<string, FeatureUsage[]> = new Map();

    setFeature(customerId: string, featureId: string, limit: number, currentUsage = 0) {
      this._setFeature(customerId, featureId, "usage", limit, currentUsage);
    }

    setEntityFeature(
      customerId: string,
      entityId: string,
      featureId: string,
      limit: number,
      currentUsage = 0,
    ) {
      this._setFeature(customerId, featureId, "usage", limit, currentUsage, entityId);
    }

    setBooleanFeature(customerId: string, featureId: string, value: boolean) {
      this._setFeature(customerId, featureId, "boolean", 1, 0, undefined, value);
    }

    setEntityBooleanFeature(
      customerId: string,
      entityId: string,
      featureId: string,
      value: boolean,
    ) {
      this._setFeature(customerId, featureId, "boolean", 1, 0, entityId, value);
    }

    private _setFeature(
      customerId: string,
      featureId: string,
      type: "usage" | "boolean",
      limit: number,
      currentUsage = 0,
      entityId?: string,
      booleanValue?: boolean,
    ): void {
      const existing = this.features.get(customerId) || [];
      const index = entityId
        ? existing.findIndex((f) => f.entityId === entityId && f.featureId === featureId)
        : existing.findIndex((f) => !f.entityId && f.featureId === featureId);

      if (index >= 0) {
        existing[index] = { featureId, type, limit, current: currentUsage, entityId, booleanValue };
      } else {
        existing.push({ featureId, type, limit, current: currentUsage, entityId, booleanValue });
      }
      this.features.set(customerId, existing);
    }

    async check(ctx: GenericActionCtx<DataModel>, args: { entityId?: string; featureId: string }) {
      const identity = await ctx.auth.getUserIdentity();
      if (!identity?.subject) throw new Error("Unable to get user");

      const customerId = identity.subject;
      const features = this.features.get(customerId) || [];
      const feature = args.entityId
        ? features.find((f) => f.entityId === args.entityId && f.featureId === args.featureId)
        : features.find((f) => f.featureId === args.featureId);

      if (!feature) {
        return {
          data: null,
          error: `Feature not found: ${args.featureId}`,
        };
      }

      if (feature.type === "boolean") {
        return { data: { allowed: feature.booleanValue ?? false }, error: null };
      }

      const allowed = feature.current < feature.limit;
      return {
        data: {
          allowed,
          included_usage: feature.limit,
          usage: feature.current,
          remaining_usage: Math.max(0, feature.limit - feature.current),
        },
        error: null,
      };
    }

    async track(
      ctx: GenericActionCtx<DataModel>,
      args: { entityId?: string; featureId: string; value: number },
    ) {
      const identity = await ctx.auth.getUserIdentity();
      if (!identity?.subject) throw new Error("Unable to get user");

      const customerId = identity.subject;
      const features = this.features.get(customerId) || [];
      const feature = args.entityId
        ? features.find((f) => f.entityId === args.entityId && f.featureId === args.featureId)
        : features.find((f) => f.featureId === args.featureId);

      if (!feature) {
        return { success: false, error: `Feature not found: ${args.featureId}` };
      }
      if (feature.type === "boolean") {
        return { success: false, error: "Cannot track boolean features" };
      }

      const newValue = feature.current + args.value;
      if (newValue > feature.limit) {
        throw new Error(`Feature limit exceeded for ${args.featureId}`);
      }
      feature.current = Math.max(0, newValue);
      this.features.set(customerId, features);
      return { success: true };
    }

    async checkout(
      ctx: GenericActionCtx<DataModel>,
      args: {
        productId: string;
        successUrl?: string;
        customerData?: { name?: string; email?: string };
        checkoutSessionParams?: Record<string, unknown>;
      },
    ) {
      return {
        data: {
          url: `https://checkout.relic.so/session/mock-${args.productId}-${Date.now()}`,
        },
        error: null,
      };
    }

    customers = {
      billingPortal: async (ctx: GenericActionCtx<DataModel>, args: { returnUrl?: string }) => {
        return {
          data: {
            url: `https://billing.relic.so/portal/mock-${Date.now()}`,
          },
          error: null,
        };
      },
    };

    reset() {
      this.features.clear();
    }

    getUserFeature(customerId: string, featureId: string) {
      const features = this.features.get(customerId) || [];
      const feature = features.find((f) => f.featureId === featureId);
      return feature ? { limit: feature.limit, current: feature.current } : null;
    }

    getEntityFeature(customerId: string, entityId: string, featureId: string) {
      const features = this.features.get(customerId) || [];
      const feature = features.find((f) => f.entityId === entityId && f.featureId === featureId);
      return feature ? { limit: feature.limit, current: feature.current } : null;
    }
  }

  return { _mockAutumn: new MockAutumnInline() };
});

// Export mock for tests to access via globalThis
// biome-ignore lint/suspicious/noExplicitAny: Test mock needs to be accessible via globalThis
(globalThis as any).__mockAutumn = _mockAutumn;

vi.mock("../convex/autumn", () => ({
  autumn: _mockAutumn,
  initAutumn: () => _mockAutumn,
}));
