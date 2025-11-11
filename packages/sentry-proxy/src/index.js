export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", {
        status: 405,
        headers: corsHeaders,
      });
    }

    try {
      const body = await request.json();
      const {
        message,
        source,
        level = "error",
        context = {},
        tags = {},
        user = null,
        fingerprint = null,
        breadcrumbs = [],
      } = body;

      if (!message) {
        return new Response(JSON.stringify({ error: "Message required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!env.SENTRY_DSN) {
        console.error("SENTRY_DSN not configured");
        return new Response(JSON.stringify({ error: "Configuration error" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const dsnMatch = env.SENTRY_DSN.match(/https:\/\/([^@]+)@([^/]+)\/(\d+)/);

      if (!dsnMatch) {
        console.error("Invalid SENTRY_DSN format");
        return new Response(JSON.stringify({ error: "Invalid DSN format" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const [, publicKey, host, projectId] = dsnMatch;

      const eventId = crypto.randomUUID().replace(/-/g, "");
      const timestamp = Math.floor(Date.now() / 1000);

      const event = {
        event_id: eventId,
        timestamp: timestamp,
        platform: "other",
        level: level,
        logger: source,
        message: message,
        extra: context,
        tags: {
          source,
          ...tags,
        },
        ...(user && { user }),
        ...(fingerprint && {
          fingerprint: Array.isArray(fingerprint) ? fingerprint : [fingerprint],
        }),
        ...(breadcrumbs.length > 0 && { breadcrumbs }),
      };

      const envelopeHeader = JSON.stringify({
        event_id: eventId,
        sent_at: new Date().toISOString(),
      });

      const itemHeader = JSON.stringify({
        type: "event",
        content_type: "application/json",
      });

      const envelopeBody = `${envelopeHeader}\n${itemHeader}\n${JSON.stringify(event)}\n`;

      const sentryUrl = `https://${host}/api/${projectId}/envelope/`;

      console.log("Sending to Sentry:", sentryUrl);

      const sentryResponse = await fetch(sentryUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-sentry-envelope",
          "X-Sentry-Auth": `Sentry sentry_version=7, sentry_client=cloudflare-worker/1.0.0, sentry_key=${publicKey}`,
        },
        body: envelopeBody,
      });

      if (!sentryResponse.ok) {
        const errorText = await sentryResponse.text();
        console.error("Sentry error:", sentryResponse.status, errorText);
        return new Response(
          JSON.stringify({
            error: "Sentry rejected event",
            status: sentryResponse.status,
            details: errorText,
          }),
          {
            status: 502,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      console.log("Successfully sent to Sentry");

      return new Response(
        JSON.stringify({
          success: true,
          event_id: eventId,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    } catch (error) {
      console.error("Worker error:", error);
      return new Response(
        JSON.stringify({
          error: "Internal error",
          message: error.message,
          stack: error.stack,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
  },
};
