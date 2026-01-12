import { internal } from "./_generated/api";
import type { Id } from "./betterAuth/_generated/dataModel";

const WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS = 300; // 5 minutes

export type StripeEvent = {
  id: string; // Event ID for idempotency
  type: string;
  data: {
    object: {
      id: string;
      customer?: string;
      metadata?: {
        userId?: string;
      };
      status?: string;
      items?: {
        data: Array<{
          plan?: { id?: string };
          price?: { id?: string };
        }>;
      };
    };
  };
};

export async function verifyStripeSignature(
  payload: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const parts = signature.split(",");
  let timestamp = "";
  let sig = "";

  for (const part of parts) {
    const [k, value] = part.split("=");
    if (k === "t" && value) timestamp = value;
    if (k === "v1" && value) sig = value;
  }

  if (!timestamp || !sig) return false;

  // Prevent replay attacks by checking timestamp tolerance
  const timestampSeconds = parseInt(timestamp, 10);
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestampSeconds) > WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS) {
    console.error("[Stripe Webhook] Timestamp outside tolerance window");
    return false;
  }

  const signedPayload = `${timestamp}.${payload}`;
  const expectedSig = await crypto.subtle.sign("HMAC", key, encoder.encode(signedPayload));

  const expectedSigHex = Array.from(new Uint8Array(expectedSig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return expectedSigHex === sig;
}

type WebhookContext = {
  // biome-ignore lint/suspicious/noExplicitAny: Convex HTTP action context requires generic mutation types
  runMutation: (mutation: any, args: any) => Promise<any>;
  scheduler: {
    // biome-ignore lint/suspicious/noExplicitAny: Convex scheduler requires generic mutation types
    runAfter: (delayMs: number, mutation: any, args: any) => Promise<Id<"_scheduled_functions">>;
  };
};

function isValidUserId(userId: string): userId is Id<"user"> {
  // Convex IDs follow a specific pattern - basic validation
  return typeof userId === "string" && userId.length > 0 && userId.length < 100;
}

export async function handleWebhookEvent(ctx: WebhookContext, event: StripeEvent) {
  const { type, data } = event;
  const { metadata, status, items } = data.object;

  if (!metadata?.userId) {
    console.log("[Stripe Webhook] No userId in metadata, skipping");
    return;
  }

  if (!isValidUserId(metadata.userId)) {
    console.error(`[Stripe Webhook] Invalid userId format: ${metadata.userId}`);
    return;
  }

  const userId = metadata.userId;

  switch (type) {
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const isActive = status === "active";

      const firstItem = items?.data?.[0];
      const priceId = firstItem?.price?.id ?? firstItem?.plan?.id;

      await handleUserSubscriptionChange(ctx, userId, isActive, priceId);
      break;
    }

    case "customer.subscription.deleted": {
      await handleUserSubscriptionChange(ctx, userId, false, undefined);
      break;
    }

    case "checkout.session.completed": {
      console.log(`[Stripe Webhook] Checkout completed for user ${userId}`);
      // Handle the upgrade directly here since subscription events don't have userId in metadata
      // The checkout session metadata contains userId, but Stripe doesn't copy it to subscription
      await ctx.scheduler.runAfter(0, internal.user._handlePlanUpgrade, { userId });
      break;
    }

    case "invoice.payment_failed": {
      console.log(
        `[Stripe Webhook] Payment failed for user ${userId}, handled by subscription.updated`,
      );
      break;
    }

    default:
      console.log(`[Stripe Webhook] Unhandled event type: ${type}`);
  }
}

async function handleUserSubscriptionChange(
  ctx: Pick<WebhookContext, "scheduler">,
  userId: Id<"user">,
  isActive: boolean,
  priceId?: string,
) {
  const isProPlan = priceId === process.env.STRIPE_PRO_PRICE_ID;

  if (isActive && isProPlan) {
    console.log(`[User Webhook] Upgrading user ${userId} to Pro`);
    await ctx.scheduler.runAfter(0, internal.user._handlePlanUpgrade, { userId });
  } else {
    console.log(`[User Webhook] Downgrading user ${userId} to Free`);
    await ctx.scheduler.runAfter(0, internal.user._handlePlanDowngrade, { userId });
  }
}
