import { Autumn } from "@useautumn/convex";
import type { GenericActionCtx } from "convex/server";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";

type AutumnContext = GenericActionCtx<DataModel>;

export const initAutumn = (identity: {
  customerId: string;
  customerData?: {
    name?: string | null;
    email?: string | null;
  };
}) =>
  new Autumn(components.autumn, {
    secretKey: process.env.AUTUMN_SECRET_KEY ?? "",
    identify: async (_ctx: AutumnContext) => {
      return identity;
    },
  });

export const autumn = new Autumn(components.autumn, {
  secretKey: process.env.AUTUMN_SECRET_KEY ?? "",
  identify: async (ctx: AutumnContext) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const userId = identity.subject;
    return {
      customerId: userId,
      customerData: {
        name: identity.name as string,
        email: identity.email as string,
      },
    };
  },
});

export const {
  track,
  cancel,
  query,
  attach,
  check,
  checkout,
  usage,
  setupPayment,
  createCustomer,
  listProducts,
  billingPortal,
  createReferralCode,
  redeemReferralCode,
  createEntity,
  getEntity,
} = autumn.api();

// NOTE: attemptCount must start at 1 to ensure everything works correctly
export const _retryAutumnTracking = internalMutation({
  args: {
    identity: v.object({
      customerId: v.string(),
      customerData: v.optional(
        v.object({
          name: v.optional(v.string()),
          email: v.optional(v.string()),
        }),
      ),
    }),
    projectId: v.id("project"),
    featureId: v.string(),
    value: v.number(),
    attemptCount: v.number(),
  },
  handler: async (ctx, args) => {
    const MAX_RETRIES = 3;

    const autumn = initAutumn(args.identity);

    try {
      await autumn.track(ctx, { featureId: args.featureId, value: args.value });
    } catch (_error: unknown) {
      if (args.attemptCount < MAX_RETRIES) {
        const baseDelay = 5 * 60 * 1000;
        const maxDelay = 60 * 60 * 1000;
        const backoffMs = Math.min(baseDelay * 2 ** (args.attemptCount - 1), maxDelay);

        await ctx.scheduler.runAfter(backoffMs, internal.autumn._retryAutumnTracking, {
          ...args,
          attemptCount: args.attemptCount + 1,
        });
      } else {
        console.error("Max retries exceeded for Autumn tracking:", {
          projectId: args.projectId,
          featureId: args.featureId,
          customerId: args.identity.customerId,
        });
      }
    }
  },
});
