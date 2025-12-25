/// <reference types="vite/client" />

import { vi } from "vitest";

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

    async check(ctx: any, args: { entityId?: string; featureId: string }) {
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

    async track(ctx: any, args: { entityId?: string; featureId: string; value: number }) {
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
(globalThis as any).__mockAutumn = _mockAutumn;

vi.mock("../convex/autumn", () => ({
  autumn: _mockAutumn,
  initAutumn: () => _mockAutumn,
}));
