import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { httpAction } from "./_generated/server";
import { authComponent, createAuth } from "./auth";
import { type AutumnWebhookEvent, handleAutumnWebhookEvent } from "./autumnWebhook";
import type { Id as BetterAuthId } from "./betterAuth/_generated/dataModel";
import { hashKey } from "./lib/crypto";
import { toHttpErrorResponse } from "./lib/errors";
import { createLogger } from "./lib/logger";
import { verifySvixSignature } from "./lib/svix";
import { EmailKind } from "./lib/types";

const autumnLog = createLogger("autumnWebhook");
const resendLog = createLogger("resendWebhook");

const http = httpRouter();
authComponent.registerRoutes(http, createAuth);

export const AUTUMN_WEBHOOK_SECRET = process.env.AUTUMN_WEBHOOK_SECRET;
export const RESEND_WEBHOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET;

http.route({
  path: "/webhook/autumn",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const svixId = request.headers.get("svix-id");
    const svixTimestamp = request.headers.get("svix-timestamp");
    const svixSignature = request.headers.get("svix-signature");
    const rawPayload = await request.text();

    if (!AUTUMN_WEBHOOK_SECRET) {
      autumnLog.error("AUTUMN_WEBHOOK_SECRET is not configured");
      return new Response("Server configuration error", { status: 500 });
    }

    const isValid = await verifySvixSignature(
      rawPayload,
      {
        "svix-id": svixId,
        "svix-timestamp": svixTimestamp,
        "svix-signature": svixSignature,
      },
      AUTUMN_WEBHOOK_SECRET,
    );

    if (!isValid) {
      autumnLog.error("Invalid signature");
      return new Response("Invalid signature", { status: 401 });
    }

    if (!svixId) {
      autumnLog.error("Missing svix-id header");
      return new Response("Missing event ID", { status: 400 });
    }

    const alreadyProcessed = await ctx.runQuery(internal.webhook._isProcessed, {
      eventId: svixId,
      source: "autumn",
    });
    if (alreadyProcessed) {
      autumnLog.info("Event already processed, skipping", { svixId });
      return new Response("Already processed", { status: 200 });
    }

    try {
      const payload = JSON.parse(rawPayload) as AutumnWebhookEvent;
      autumnLog.info("Event received", {
        type: payload.type,
        scenario: payload.data?.scenario,
        svixId,
      });

      await handleAutumnWebhookEvent(ctx, payload);

      await ctx.runMutation(internal.webhook._markProcessed, {
        eventId: svixId,
        source: "autumn",
      });
    } catch (error) {
      autumnLog.error("Error handling webhook", { error: String(error) });
      return new Response("Webhook handler error", { status: 500 });
    }

    return new Response(null, { status: 200 });
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

    const isValid = await verifySvixSignature(
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

    const alreadyProcessed = await ctx.runQuery(internal.webhook._isProcessed, {
      eventId: svixId,
      source: "resend",
    });
    if (alreadyProcessed) {
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

        if (userId && emailKind && emailKind !== EmailKind.AccountDeleted) {
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

      await ctx.runMutation(internal.webhook._markProcessed, {
        eventId: svixId,
        source: "resend",
      });

      return new Response(null, { status: 200 });
    } catch (error) {
      resendLog.error("Error handling webhook", { error: String(error) });
      return new Response("Webhook handler error", { status: 500 });
    }
  }),
});

http.route({
  path: "/api/secrets/export",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing or invalid Authorization header" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const hashedApiKey = await hashKey(authHeader.slice(7));
    const clientIp =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("cf-connecting-ip") ??
      "unknown";

    let body: Record<string, unknown>;

    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!body.projectId) {
      return new Response(JSON.stringify({ error: "projectId is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      const { userId, apiKeyId } = await ctx.runMutation(internal.apiKey._validateApiKey, {
        hashedApiKey,
        requiredScopes: ["secrets.read"],
        clientIp,
        requestedProjectId: body.projectId as string | undefined,
      });

      const result = await ctx.runMutation(internal.secret._exportSecretsCore, {
        userId,
        apiKeyId,
        projectId: body.projectId as Id<"project">,
        environmentName: body.environmentName as string | undefined,
        environmentId: body.environmentId as Id<"environment"> | undefined,
        folderName: body.folderName as string | undefined,
        folderId: body.folderId as Id<"folder"> | undefined,
        scope: body.scope as "client" | "server" | "shared" | undefined,
      });

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      return toHttpErrorResponse(error);
    }
  }),
});

http.route({
  path: "/api/user/keys",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing or invalid Authorization header" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const hashedApiKey = await hashKey(authHeader.slice(7));
    const clientIp =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("cf-connecting-ip") ??
      "unknown";

    try {
      const { userId } = await ctx.runMutation(internal.apiKey._validateApiKey, {
        hashedApiKey,
        requiredScopes: ["user.keys.read"],
        clientIp,
      });

      const keys = await ctx.runQuery(internal.apiKey._getUserCryptoKeys, { userId });

      return new Response(JSON.stringify(keys), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      return toHttpErrorResponse(error);
    }
  }),
});

http.route({
  path: "/api/sa/secrets/export",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing or invalid Authorization header" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    const rawToken = authHeader.slice(7);
    const hashedToken = await hashKey(rawToken);
    const oidcToken = request.headers.get("X-Oidc-Token") ?? undefined;
    const clientIp =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("cf-connecting-ip") ??
      "unknown";
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    try {
      const sa = await ctx.runMutation(internal.serviceAccount._validateServiceToken, {
        hashedToken,
        clientIp,
      });

      if (sa.oidcIssuer && sa.oidcSubjectPattern) {
        if (!oidcToken) {
          return new Response(
            JSON.stringify({
              error: "OIDC token required. This service account has an OIDC policy configured.",
              code: "OIDC_TOKEN_REQUIRED",
            }),
            { status: 401, headers: { "Content-Type": "application/json" } },
          );
        }

        const { validateOidcToken } = await import("./lib/oidc");
        const oidcResult = await validateOidcToken(
          oidcToken,
          sa.oidcIssuer,
          sa.oidcSubjectPattern,
          sa.oidcAudience,
        );

        if (!oidcResult.valid) {
          return new Response(
            JSON.stringify({ error: oidcResult.error, code: "OIDC_VALIDATION_FAILED" }),
            { status: 403, headers: { "Content-Type": "application/json" } },
          );
        }
      }

      const result = await ctx.runMutation(internal.secret._exportSecretsForServiceAccount, {
        serviceAccountId: sa.serviceAccountId,
        projectId: sa.projectId,
        environmentName: body.environmentName as string | undefined,
        folderName: body.folderName as string | undefined,
        scope: body.scope as "client" | "server" | "shared" | undefined,
      });
      return new Response(
        JSON.stringify({
          ...result,
          encryptedProjectKey: sa.encryptedProjectKey,
          encryptedPrivateKey: sa.encryptedPrivateKey,
          salt: sa.salt,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    } catch (error) {
      return toHttpErrorResponse(error);
    }
  }),
});

export default http;
