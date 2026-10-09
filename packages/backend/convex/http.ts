import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { type ActionCtx, httpAction } from "./_generated/server";
import { authComponent, createAuth } from "./auth";
import type { Id as BetterAuthId } from "./betterAuth/_generated/dataModel";
import { getWebhookCustomerId } from "./billing";
import { hashKey } from "./lib/crypto";
import { credentialFailureResponse, toHttpErrorResponse } from "./lib/errors";
import { createLogger, type Logger } from "./lib/logger";
import { parsePushAudit, parseScopes } from "./lib/push";
import { verifySvixSignature } from "./lib/svix";
import { EmailKind } from "./lib/types";

const http = httpRouter();
authComponent.registerRoutes(http, createAuth);

type Scope = "client" | "server" | "shared";
const SCOPES = new Set<string>(["client", "server", "shared"]);

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function getBearerToken(request: Request): string | null {
  const match = request.headers.get("Authorization")?.match(/^Bearer\s+(\S+)\s*$/i);
  return match?.[1] ?? null;
}

// The leftmost X-Forwarded-For entry is client-controlled; the rightmost one was appended by our edge.
function getClientIp(request: Request): string {
  const cfIp = request.headers.get("cf-connecting-ip")?.trim();
  if (cfIp) return cfIp;
  const forwarded = request.headers
    .get("x-forwarded-for")
    ?.split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return forwarded?.at(-1) ?? "unknown";
}

async function readJsonBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function optionalScope(value: unknown): Scope | undefined {
  return typeof value === "string" && SCOPES.has(value) ? (value as Scope) : undefined;
}

const missingAuth = () => json({ error: "Missing or invalid Authorization header" }, 401);
const invalidBody = () => json({ error: "Invalid JSON body" }, 400);

async function verifyServiceAccountOidc(
  sa: { oidcIssuer?: string; oidcSubjectPattern?: string; oidcAudience?: string },
  oidcToken: string | null,
): Promise<Response | null> {
  if (!sa.oidcIssuer || !sa.oidcSubjectPattern) return null;

  if (!oidcToken) {
    return json(
      {
        error: "OIDC token required. This service account has an OIDC policy configured.",
        code: "OIDC_TOKEN_REQUIRED",
      },
      401,
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
    return json({ error: oidcResult.error, code: "OIDC_VALIDATION_FAILED" }, 403);
  }

  return null;
}

/** Verifies a Svix-signed webhook, skips duplicate deliveries, and records successful ones. */
function svixWebhook(
  source: "autumn" | "resend",
  secretEnv: string,
  handle: (ctx: ActionCtx, payload: unknown, log: Logger) => Promise<void>,
) {
  const log = createLogger(`${source}Webhook`);

  return httpAction(async (ctx, request) => {
    const secret = process.env[secretEnv];
    if (!secret) {
      log.error(`${secretEnv} is not configured`);
      return new Response("Server configuration error", { status: 500 });
    }

    const svixId = request.headers.get("svix-id");
    const rawPayload = await request.text();
    const isValid = await verifySvixSignature(
      rawPayload,
      {
        "svix-id": svixId,
        "svix-timestamp": request.headers.get("svix-timestamp"),
        "svix-signature": request.headers.get("svix-signature"),
      },
      secret,
    );

    if (!isValid) {
      log.error("Invalid signature");
      return new Response("Invalid signature", { status: 401 });
    }
    if (!svixId) {
      return new Response("Missing event ID", { status: 400 });
    }

    if (await ctx.runQuery(internal.webhook._isProcessed, { eventId: svixId, source })) {
      log.info("Event already processed, skipping", { svixId });
      return new Response("Already processed", { status: 200 });
    }

    try {
      await handle(ctx, JSON.parse(rawPayload), log);
      await ctx.runMutation(internal.webhook._markProcessed, { eventId: svixId, source });
      return new Response(null, { status: 200 });
    } catch (error) {
      log.error("Error handling webhook", { svixId, error: String(error) });
      return new Response("Webhook handler error", { status: 500 });
    }
  });
}

http.route({
  path: "/webhook/autumn",
  method: "POST",
  handler: svixWebhook("autumn", "AUTUMN_WEBHOOK_SECRET", async (ctx, payload, log) => {
    const customerId = getWebhookCustomerId(payload);
    log.info("Event received", { type: (payload as { type?: string }).type, customerId });

    if (customerId) {
      await ctx.scheduler.runAfter(0, internal.billing._refreshPlan, { userId: customerId });
    }
  }),
});

type ResendPayload = {
  type?: string;
  data?: { email_id?: string; tags?: Record<string, unknown> };
};

const EMAIL_KINDS = new Set<unknown>(Object.values(EmailKind));

http.route({
  path: "/webhook/resend",
  method: "POST",
  handler: svixWebhook("resend", "RESEND_WEBHOOK_SECRET", async (ctx, raw, log) => {
    const payload = raw as ResendPayload;
    const tags = payload.data?.tags ?? {};
    const userId = typeof tags.userId === "string" ? tags.userId : undefined;
    const emailId = typeof tags.emailId === "string" ? tags.emailId : undefined;
    const emailKind = EMAIL_KINDS.has(tags.kind) ? (tags.kind as EmailKind) : undefined;
    log.info("Event received", { eventType: payload.type });

    if (!userId || userId.length > 64 || !emailKind) return;

    if (payload.type === "email.delivered" && emailKind !== EmailKind.AccountDeleted) {
      await ctx.runMutation(internal.user._handleEmailDelivered, {
        userId: userId as BetterAuthId<"user">,
        emailKind,
        emailId:
          emailId || (typeof payload.data?.email_id === "string" ? payload.data.email_id : ""),
        deliveredAt: Date.now(),
      });
    } else if (payload.type === "email.bounced" || payload.type === "email.delivery_delayed") {
      await ctx.runMutation(internal.user._handleEmailFailed, {
        userId,
        emailKind,
        reason: payload.type,
        failedAt: Date.now(),
      });
    }
  }),
});

http.route({
  path: "/health",
  method: "GET",
  handler: httpAction(async () =>
    json(
      {
        status: "healthy",
        service: "relic-api",
        timestamp: new Date().toISOString(),
        environment: process.env.ENVIRONMENT || "development",
      },
      200,
      { "Cache-Control": "no-store" },
    ),
  ),
});

http.route({
  path: "/api/secrets/export",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const token = getBearerToken(request);
    if (!token) return missingAuth();

    const body = await readJsonBody(request);
    if (!body) return invalidBody();

    const projectId = optionalString(body.projectId);
    if (!projectId) return json({ error: "projectId is required" }, 400);

    try {
      const auth = await ctx.runMutation(internal.apiKey._validateApiKey, {
        hashedApiKey: await hashKey(token),
        requiredScopes: ["secrets.read"],
        clientIp: getClientIp(request),
        requestedProjectId: projectId,
      });
      if (!auth.ok) return credentialFailureResponse(auth);

      const ids = await ctx.runQuery(internal.secret._normalizeExportIds, {
        projectId,
        environmentId: optionalString(body.environmentId),
        folderId: optionalString(body.folderId),
      });
      if (!ids) {
        return json(
          { error: "Invalid projectId, environmentId or folderId", code: "INVALID_ARGUMENTS" },
          400,
        );
      }

      const result = await ctx.runMutation(internal.secret._exportSecretsCore, {
        userId: auth.userId,
        apiKeyId: auth.apiKeyId,
        projectId: ids.projectId,
        environmentName: optionalString(body.environmentName),
        environmentId: ids.environmentId,
        folderName: optionalString(body.folderName),
        folderId: ids.folderId,
        scope: optionalScope(body.scope),
        scopes: parseScopes(body.scopes),
        push: parsePushAudit(body.push),
      });

      return json(result);
    } catch (error) {
      return toHttpErrorResponse(error);
    }
  }),
});

http.route({
  path: "/api/user/keys",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const token = getBearerToken(request);
    if (!token) return missingAuth();

    try {
      const auth = await ctx.runMutation(internal.apiKey._validateApiKey, {
        hashedApiKey: await hashKey(token),
        requiredScopes: ["user.keys.read"],
        clientIp: getClientIp(request),
      });
      if (!auth.ok) return credentialFailureResponse(auth);

      return json(await ctx.runQuery(internal.apiKey._getUserCryptoKeys, { userId: auth.userId }));
    } catch (error) {
      return toHttpErrorResponse(error);
    }
  }),
});

http.route({
  path: "/api/sa/secrets/export",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const token = getBearerToken(request);
    if (!token) return missingAuth();

    const body = await readJsonBody(request);
    if (!body) return invalidBody();

    try {
      const sa = await ctx.runMutation(internal.serviceAccount._validateServiceToken, {
        hashedToken: await hashKey(token),
        clientIp: getClientIp(request),
      });
      if (!sa.ok) return credentialFailureResponse(sa);

      const oidcFailure = await verifyServiceAccountOidc(sa, request.headers.get("X-Oidc-Token"));
      if (oidcFailure) return oidcFailure;

      const result = await ctx.runMutation(internal.secret._exportSecretsForServiceAccount, {
        serviceAccountId: sa.serviceAccountId,
        projectId: sa.projectId,
        environmentName: optionalString(body.environmentName),
        folderName: optionalString(body.folderName),
        scope: optionalScope(body.scope),
        scopes: parseScopes(body.scopes),
        push: parsePushAudit(body.push),
      });

      return json({
        ...result,
        encryptedProjectKey: sa.encryptedProjectKey,
        encryptedPrivateKey: sa.encryptedPrivateKey,
        salt: sa.salt,
      });
    } catch (error) {
      return toHttpErrorResponse(error);
    }
  }),
});

http.route({
  path: "/api/secrets/names",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const token = getBearerToken(request);
    if (!token) return missingAuth();

    const body = await readJsonBody(request);
    if (!body) return invalidBody();

    const projectId = optionalString(body.projectId);
    const environmentName = optionalString(body.environmentName);
    if (!projectId || !environmentName) {
      return json({ error: "projectId and environmentName are required" }, 400);
    }

    try {
      const auth = await ctx.runMutation(internal.apiKey._validateApiKey, {
        hashedApiKey: await hashKey(token),
        requiredScopes: ["secrets.read"],
        clientIp: getClientIp(request),
        requestedProjectId: projectId,
      });
      if (!auth.ok) return credentialFailureResponse(auth);

      const ids = await ctx.runQuery(internal.secret._normalizeExportIds, { projectId });
      if (!ids) return json({ error: "Invalid projectId", code: "INVALID_ARGUMENTS" }, 400);

      const result = await ctx.runQuery(internal.secret._listSecretNamesForUser, {
        userId: auth.userId,
        projectId: ids.projectId,
        environmentName,
        folderName: optionalString(body.folderName),
        scope: optionalScope(body.scope),
      });

      return json(result);
    } catch (error) {
      return toHttpErrorResponse(error);
    }
  }),
});

http.route({
  path: "/api/sa/secrets/names",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const token = getBearerToken(request);
    if (!token) return missingAuth();

    const body = await readJsonBody(request);
    if (!body) return invalidBody();

    const environmentName = optionalString(body.environmentName);
    if (!environmentName) return json({ error: "environmentName is required" }, 400);

    try {
      const sa = await ctx.runMutation(internal.serviceAccount._validateServiceToken, {
        hashedToken: await hashKey(token),
        clientIp: getClientIp(request),
      });
      if (!sa.ok) return credentialFailureResponse(sa);

      const oidcFailure = await verifyServiceAccountOidc(sa, request.headers.get("X-Oidc-Token"));
      if (oidcFailure) return oidcFailure;

      const result = await ctx.runQuery(internal.secret._listSecretNamesForServiceAccount, {
        projectId: sa.projectId,
        environmentName,
        folderName: optionalString(body.folderName),
        scope: optionalScope(body.scope),
      });

      return json(result);
    } catch (error) {
      return toHttpErrorResponse(error);
    }
  }),
});

export default http;
