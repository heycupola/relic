import type { GenericActionCtx } from "convex/server";
import type { DataModel } from "../../convex/_generated/dataModel";

export interface MockAutumnCheckData {
  allowed: boolean;
  included_usage?: number;
  usage?: number;
  remaining_usage?: number;
}

export interface MockAutumnCheckResult {
  data: MockAutumnCheckData | null;
  error: string | null;
}

export interface MockAutumnTrackResult {
  success: boolean;
  error?: string;
}

type AutumnContext = GenericActionCtx<DataModel>;

interface FeatureUsage {
  entityId?: string;
  featureId: string;
  type: "usage" | "boolean";
  limit: number;
  current: number;
  booleanValue?: boolean;
}

export class MockAutumn {
  private features: Map<string, FeatureUsage[]>;
  private identifyFn: ((ctx: AutumnContext) => Promise<{ customerId: string } | null>) | null;

  constructor(identifyFn?: (ctx: AutumnContext) => Promise<{ customerId: string } | null>) {
    this.features = new Map();
    this.identifyFn = identifyFn || null;
  }

  public setFeature(
    customerId: string,
    featureId: string,
    limit: number,
    currentUsage: number = 0,
  ) {
    this._setFeature(customerId, featureId, "usage", limit, currentUsage);
  }

  public setEntityFeature(
    customerId: string,
    entityId: string,
    featureId: string,
    limit: number,
    currentUsage: number = 0,
  ) {
    this._setFeature(customerId, featureId, "usage", limit, currentUsage, entityId);
  }

  public setBooleanFeature(customerId: string, featureId: string, value: boolean) {
    this._setFeature(customerId, featureId, "boolean", 1, 0, undefined, value);
  }

  public setEntityBooleanFeature(
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
    currentUsage: number = 0,
    entityId?: string,
    booleanValue?: boolean,
  ): void {
    const existing = this.features.get(customerId) || [];

    let index: number = -1;
    if (entityId) {
      index = existing.findIndex((f) => f.entityId === entityId && f.featureId === featureId);
    } else {
      index = existing.findIndex((f) => !f.entityId && f.featureId === featureId);
    }

    if (index >= 0) {
      existing[index] = { featureId, type, limit, current: currentUsage, entityId, booleanValue };
    } else {
      existing.push({ featureId, type, limit, current: currentUsage, entityId, booleanValue });
    }

    this.features.set(customerId, existing);
  }

  async check(
    ctx: AutumnContext,
    args: { entityId?: string; featureId: string },
  ): Promise<MockAutumnCheckResult> {
    let customerId: string;
    if (this.identifyFn) {
      const identity = await this.identifyFn(ctx);

      if (!identity || !identity.customerId) {
        throw new Error("Unable to get user");
      }

      customerId = identity.customerId;
    } else {
      throw new Error("Unable to identify user");
    }

    const features = this.features.get(customerId) || [];

    let feature: FeatureUsage | undefined;
    if (args.entityId) {
      feature = features.find(
        (f) => f.entityId === args.entityId && f.featureId === args.featureId,
      );
    } else {
      feature = features.find((f) => f.featureId === args.featureId);
    }

    if (!feature) {
      return {
        data: null,
        error: `Feature not found for the given featureId: ${args.featureId} ${args.entityId && `and entityId: ${args.entityId}`}`,
      };
    }

    if (feature.type === "boolean") {
      return {
        data: {
          allowed: feature.booleanValue ?? false,
        },
        error: null,
      };
    }

    const allowed = feature.current < feature.limit;
    const remaining = Math.max(0, feature.limit - feature.current);

    return {
      data: {
        allowed,
        included_usage: feature.limit,
        usage: feature.current,
        remaining_usage: remaining,
      },
      error: null,
    };
  }

  async track(
    ctx: AutumnContext,
    args: { entityId?: string; featureId: string; value: number },
  ): Promise<MockAutumnTrackResult> {
    let customerId: string;
    if (this.identifyFn) {
      const identity = await this.identifyFn(ctx);

      if (!identity || !identity.customerId) {
        throw new Error("Unable to get user");
      }

      customerId = identity.customerId;
    } else {
      throw new Error("Unable to identify user");
    }

    const features = this.features.get(customerId) || [];

    let feature: FeatureUsage | undefined;
    if (args.entityId) {
      feature = features.find(
        (f) => f.entityId === args.entityId && f.featureId === args.featureId,
      );
    } else {
      feature = features.find((f) => f.featureId === args.featureId);
    }

    if (!feature) {
      return {
        success: false,
        error: `Feature not found for the given featureId: ${args.featureId} ${args.entityId && `and entityId: ${args.entityId}`}`,
      };
    }

    if (feature.type === "boolean") {
      return {
        success: false,
        error: "Cannot track usage on boolean features",
      };
    }

    const newValue = feature.current + args.value;

    if (newValue > feature.limit) {
      throw new Error(
        `Feature limit exceeded for ${args.featureId}: current=${feature.current}, limit=${feature.limit}, trying to add=${args.value}`,
      );
    }

    feature.current = Math.max(0, newValue);
    this.features.set(customerId, features);

    return { success: true };
  }

  public reset(): void {
    this.features.clear();
  }

  public getUserFeature(
    customerId: string,
    featureId: string,
  ): { limit: number; current: number } | null {
    const features = this.features.get(customerId) || [];
    const feature = features.find((f) => f.featureId === featureId);
    return feature ? { limit: feature.limit, current: feature.current } : null;
  }

  public getEntityFeature(
    customerId: string,
    entityId: string,
    featureId: string,
  ): { limit: number; current: number } | null {
    const features = this.features.get(customerId) || [];
    const feature = features.find((f) => f.entityId === entityId && f.featureId === featureId);
    return feature ? { limit: feature.limit, current: feature.current } : null;
  }
}

export function createMockAutumn(
  identifyFn?: (ctx: AutumnContext) => Promise<{ customerId: string } | null>,
): MockAutumn {
  return new MockAutumn(identifyFn);
}
