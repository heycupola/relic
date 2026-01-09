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

const autumnApi = autumn.api();

// biome-ignore lint/suspicious/noExplicitAny: Type portability requirement for exported functions
export const track = autumnApi.track as any;
// biome-ignore lint/suspicious/noExplicitAny: Type portability requirement for exported functions
export const cancel = autumnApi.cancel as any;
// biome-ignore lint/suspicious/noExplicitAny: Type portability requirement for exported functions
export const query = autumnApi.query as any;
// biome-ignore lint/suspicious/noExplicitAny: Type portability requirement for exported functions
export const attach = autumnApi.attach as any;
// biome-ignore lint/suspicious/noExplicitAny: Type portability requirement for exported functions
export const check = autumnApi.check as any;
// biome-ignore lint/suspicious/noExplicitAny: Type portability requirement for exported functions
export const checkout = autumnApi.checkout as any;
// biome-ignore lint/suspicious/noExplicitAny: Type portability requirement for exported functions
export const usage = autumnApi.usage as any;
// biome-ignore lint/suspicious/noExplicitAny: Type portability requirement for exported functions
export const setupPayment = autumnApi.setupPayment as any;
// biome-ignore lint/suspicious/noExplicitAny: Type portability requirement for exported functions
export const createCustomer = autumnApi.createCustomer as any;
// biome-ignore lint/suspicious/noExplicitAny: Type portability requirement for exported functions
export const listProducts = autumnApi.listProducts as any;
// biome-ignore lint/suspicious/noExplicitAny: Type portability requirement for exported functions
export const billingPortal = autumnApi.billingPortal as any;
// biome-ignore lint/suspicious/noExplicitAny: Type portability requirement for exported functions
export const createReferralCode = autumnApi.createReferralCode as any;
// biome-ignore lint/suspicious/noExplicitAny: Type portability requirement for exported functions
export const redeemReferralCode = autumnApi.redeemReferralCode as any;
// biome-ignore lint/suspicious/noExplicitAny: Type portability requirement for exported functions
export const createEntity = autumnApi.createEntity as any;
// biome-ignore lint/suspicious/noExplicitAny: Type portability requirement for exported functions
export const getEntity = autumnApi.getEntity as any;

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
