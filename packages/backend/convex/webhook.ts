import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import type { Id } from "./betterAuth/_generated/dataModel";

const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

async function verifyStripeSignature(
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
    ["verify"],
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

  const signedPayload = `${timestamp}.${payload}`;
  const expectedSig = await crypto.subtle.sign("HMAC", key, encoder.encode(signedPayload));

  const expectedSigHex = Array.from(new Uint8Array(expectedSig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return expectedSigHex === sig;
}

type StripeEvent = {
  type: string;
  data: {
    object: {
      id: string;
      customer?: string;
      metadata?: {
        userId?: string;
        organizationId?: string;
        organizationName?: string;
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

export const stripe = httpAction(async (ctx, request) => {
  const signature = request.headers.get("stripe-signature");
  const payload = await request.text();

  if (!signature) {
    console.error("Missing stripe-signature header");
    return new Response("Missing signature", { status: 400 });
  }

  if (!STRIPE_WEBHOOK_SECRET) {
    console.error("STRIPE_WEBHOOK_SECRET is not configured");
    return new Response("Server configuration error", { status: 500 });
  }

  const isValid = await verifyStripeSignature(payload, signature, STRIPE_WEBHOOK_SECRET);

  if (!isValid) {
    console.error("Invalid webhook signature");
    return new Response("Invalid signature", { status: 401 });
  }

  let event: StripeEvent;

  try {
    event = JSON.parse(payload);
  } catch (err) {
    console.error("Error parsing webhook payload:", err);
    return new Response("Invalid payload", { status: 400 });
  }

  console.log(`[Stripe Webhook] Received: ${event.type}`);

  try {
    await handleWebhookEvent(ctx, event);
  } catch (error) {
    console.error(`[Stripe Webhook] Error handling ${event.type}:`, error);
    return new Response("Error processing webhook", { status: 500 });
  }

  return new Response("OK", { status: 200 });
});

type WebhookContext = {
  // biome-ignore lint/suspicious/noExplicitAny: Convex HTTP action context requires generic mutation types
  runMutation: (mutation: any, args: any) => Promise<any>;
  scheduler: {
    // biome-ignore lint/suspicious/noExplicitAny: Convex scheduler requires generic mutation types
    runAfter: (delayMs: number, mutation: any, args: any) => Promise<void>;
  };
};

async function handleWebhookEvent(ctx: WebhookContext, event: StripeEvent) {
  const { type, data } = event;
  const { metadata, status, items } = data.object;

  if (!metadata || (!metadata.userId && !metadata.organizationId)) {
    console.log("[Stripe Webhook] No userId or organizationId in metadata, skipping");
    return;
  }

  switch (type) {
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const isActive = status === "active";
      const priceId = items?.data[0]?.price?.id || items?.data[0]?.plan?.id;

      if (metadata.organizationId) {
        await handleOrganizationSubscriptionChange(
          ctx,
          metadata.organizationId as Id<"organization">,
          isActive,
          priceId,
        );
      } else if (metadata.userId) {
        await handleUserSubscriptionChange(ctx, metadata.userId as Id<"user">, isActive, priceId);
      }
      break;
    }

    case "customer.subscription.deleted": {
      if (metadata.organizationId) {
        await handleOrganizationSubscriptionChange(
          ctx,
          metadata.organizationId as Id<"organization">,
          false,
          undefined,
        );
      } else if (metadata.userId) {
        await handleUserSubscriptionChange(ctx, metadata.userId as Id<"user">, false, undefined);
      }
      break;
    }

    case "invoice.payment_failed": {
      console.log("[Stripe Webhook] Payment failed, handled by subscription.updated");
      break;
    }

    default:
      console.log(`[Stripe Webhook] Unhandled event type: ${type}`);
  }
}

async function handleUserSubscriptionChange(
  ctx: Pick<WebhookContext, "runMutation">,
  userId: Id<"user">,
  isActive: boolean,
  priceId?: string,
) {
  const isProPlan = priceId === process.env.STRIPE_PRO_PRICE_ID;

  if (isActive && isProPlan) {
    console.log(`[User Webhook] Upgrading user ${userId} to Pro`);
    await ctx.runMutation(internal.user._handlePlanUpgrade, { userId });
  } else {
    console.log(`[User Webhook] Downgrading user ${userId} to Free`);
    await ctx.runMutation(internal.user._handlePlanDowngrade, { userId });
  }
}

async function handleOrganizationSubscriptionChange(
  ctx: WebhookContext,
  organizationId: Id<"organization">,
  isActive: boolean,
  priceId?: string,
) {
  const isOrgPlan = priceId === process.env.STRIPE_ORG_PRICE_ID;

  if (isActive && isOrgPlan) {
    console.log(`[Org Webhook] Activating organization ${organizationId}`);
    await ctx.runMutation(internal.organization._handleOrganizationActivation, {
      organizationId,
    });
  } else {
    console.log(`[Org Webhook] Payment lapsed for organization ${organizationId}`);
    await ctx.runMutation(internal.organization._handleOrganizationPaymentLapsed, {
      organizationId,
    });

    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    await ctx.scheduler.runAfter(sevenDaysMs, internal.organization._handleOrganizationSuspension, {
      organizationId,
    });
  }
}
