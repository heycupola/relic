import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { authComponent, createAuth } from "./auth";
import type { Id as BetterAuthId } from "./betterAuth/_generated/dataModel";
import { createLogger } from "./lib/logger";
import { verifyResendSignature } from "./lib/resend";
import type { EmailKind } from "./lib/types";
import { handleWebhookEvent, type StripeEvent, verifyStripeSignature } from "./stripe";

const stripeLog = createLogger("stripeWebhook");
const resendLog = createLogger("resendWebhook");

const http = httpRouter();
authComponent.registerRoutes(http, createAuth);

export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
export const RESEND_WEBHOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET;

// In-memory cache for idempotency (resets on deployment)
// For production, consider storing in database
const processedEventIds = new Set<string>();
const processedResendEventIds = new Set<string>();
const MAX_CACHED_EVENTS = 1000;

http.route({
  path: "/webhook/stripe",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const signature = request.headers.get("stripe-signature");
    const payload = await request.text();

    if (!signature) {
      stripeLog.error("Missing stripe-signature header");
      return new Response("Missing signature", { status: 400 });
    }

    if (!STRIPE_WEBHOOK_SECRET) {
      stripeLog.error("STRIPE_WEBHOOK_SECRET is not configured");
      return new Response("Server configuration error", { status: 500 });
    }

    const isValid = await verifyStripeSignature(payload, signature, STRIPE_WEBHOOK_SECRET);

    if (!isValid) {
      stripeLog.error("Invalid webhook signature");
      return new Response("Invalid signature", { status: 401 });
    }

    let event: StripeEvent;

    try {
      event = JSON.parse(payload);
    } catch (err) {
      stripeLog.error("Error parsing webhook payload", { err: String(err) });
      return new Response("Invalid payload", { status: 400 });
    }

    stripeLog.info("Event received", { type: event.type, eventId: event.id });

    // Idempotency check - skip if already processed
    if (processedEventIds.has(event.id)) {
      stripeLog.info("Event already processed, skipping", { eventId: event.id });
      return new Response("Already processed", { status: 200 });
    }

    try {
      await handleWebhookEvent(ctx, event);

      // Mark as processed after successful handling
      processedEventIds.add(event.id);

      // Prevent unbounded memory growth
      if (processedEventIds.size > MAX_CACHED_EVENTS) {
        const firstId = processedEventIds.values().next().value;
        if (firstId) processedEventIds.delete(firstId);
      }
    } catch (error) {
      stripeLog.error("Error handling event", { type: event.type, error: String(error) });
      return new Response("Error processing webhook", { status: 500 });
    }

    return new Response("OK", { status: 200 });
  }),
});

http.route({
  path: "/health",
  method: "GET",
  handler: httpAction(async (_ctx, _request) => {
    return new Response(
      JSON.stringify(
        {
          status: "healthy",
          service: "relic-api",
          timestamp: new Date().toISOString(),
          environment: process.env.ENVIRONMENT || "development",
          version: "1.0.0",
        },
        null,
        2,
      ),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      },
    );
  }),
});

http.route({
  path: "/webhook/resend",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const svixId = request.headers.get("svix-id");
    const svixTimestamp = request.headers.get("svix-timestamp");
    const svixSignature = request.headers.get("svix-signature");
    const rawPayload = await request.text();

    if (!RESEND_WEBHOOK_SECRET) {
      resendLog.error("RESEND_WEBHOOK_SECRET is not configured");
      return new Response("Server configuration error", { status: 500 });
    }

    const isValid = await verifyResendSignature(
      rawPayload,
      {
        "svix-id": svixId,
        "svix-timestamp": svixTimestamp,
        "svix-signature": svixSignature,
      },
      RESEND_WEBHOOK_SECRET,
    );

    if (!isValid) {
      resendLog.error("Invalid signature");
      return new Response("Invalid signature", { status: 401 });
    }

    if (!svixId) {
      resendLog.error("Missing svix-id header");
      return new Response("Missing event ID", { status: 400 });
    }

    // Idempotency check - skip if already processed
    if (processedResendEventIds.has(svixId)) {
      resendLog.info("Event already processed, skipping", { svixId });
      return new Response("Already processed", { status: 200 });
    }

    try {
      const payload = JSON.parse(rawPayload) as {
        type: string;
        data?: {
          email_id?: string;
          tags?: Record<string, string>;
        };
      };

      const eventType = payload.type;
      resendLog.info("Event received", { eventType, svixId });

      if (eventType === "email.delivered") {
        const tags = payload.data?.tags || {};

        // NOTE: extract the custom data from tags
        const userId = tags.userId;
        const emailKind = tags.kind as EmailKind;
        const emailId = tags.emailId;

        if (userId && emailKind) {
          await ctx.runMutation(internal.user._handleEmailDelivered, {
            userId: userId as BetterAuthId<"user">,
            emailKind,
            emailId: emailId || payload.data?.email_id || "",
            deliveredAt: Date.now(),
          });
        }
      }

      // NOTE: it's for the other events (bounced, failed, etc.)
      if (eventType === "email.bounced" || eventType === "email.delivery_delayed") {
        const tags = payload.data?.tags || {};
        const userId = tags.userId;
        const emailKind = tags.kind as EmailKind;

        if (userId && emailKind) {
          await ctx.runMutation(internal.user._handleEmailFailed, {
            userId,
            emailKind,
            reason: eventType,
            failedAt: Date.now(),
          });
        }
      }

      // Mark as processed after successful handling
      processedResendEventIds.add(svixId);

      // Prevent unbounded memory growth
      if (processedResendEventIds.size > MAX_CACHED_EVENTS) {
        const firstId = processedResendEventIds.values().next().value;
        if (firstId) processedResendEventIds.delete(firstId);
      }

      return new Response(null, { status: 200 });
    } catch (error) {
      resendLog.error("Error handling webhook", { error: String(error) });
      return new Response("Webhook handler error", { status: 500 });
    }
  }),
});

export default http;
