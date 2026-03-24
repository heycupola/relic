import { getCloudflareContext } from "@opennextjs/cloudflare";

interface OgWorkerFetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

const OG_WORKER_DEV_URL = process.env.OG_WORKER_DEV_URL || "http://127.0.0.1:8787";

function getOgWorkerBinding(): OgWorkerFetcher | null {
  const { env } = getCloudflareContext();
  const binding = (env as { RELIC_OG?: OgWorkerFetcher }).RELIC_OG;
  return binding && typeof binding.fetch === "function" ? binding : null;
}

async function proxyToOgWorker(request: Request): Promise<Response> {
  const requestUrl = new URL(request.url);
  const forwardedHeaders = new Headers();
  const accept = request.headers.get("accept");
  if (accept) {
    forwardedHeaders.set("accept", accept);
  }

  const ogWorker = getOgWorkerBinding();
  if (ogWorker) {
    const upstreamUrl = new URL(requestUrl.pathname + requestUrl.search, "https://relic-og");
    const upstreamRequest = new Request(upstreamUrl.toString(), {
      method: request.method,
      headers: forwardedHeaders,
    });

    const response = await ogWorker.fetch(upstreamRequest);
    return new Response(request.method === "HEAD" ? null : response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  }

  if (process.env.NODE_ENV === "development") {
    const upstreamUrl = new URL(requestUrl.pathname + requestUrl.search, OG_WORKER_DEV_URL);
    const response = await fetch(
      new Request(upstreamUrl.toString(), {
        method: request.method,
        headers: forwardedHeaders,
      }),
    );

    return new Response(request.method === "HEAD" ? null : response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  }

  return Response.json(
    { error: "OG worker binding is not configured for this environment." },
    { status: 500 },
  );
}

export async function GET(request: Request) {
  return proxyToOgWorker(request);
}

export async function HEAD(request: Request) {
  return proxyToOgWorker(request);
}
