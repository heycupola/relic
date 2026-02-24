const API_HOST = "us.i.posthog.com";
const ASSET_HOST = "us-assets.i.posthog.com";

async function retrieveStatic(
  request: Request,
  pathname: string,
  ctx: ExecutionContext,
): Promise<Response> {
  let response = await caches.default.match(request);
  if (!response) {
    response = await fetch(`https://${ASSET_HOST}${pathname}`);
    ctx.waitUntil(caches.default.put(request, response.clone()));
  }
  return response;
}

async function forwardRequest(request: Request, pathWithSearch: string): Promise<Response> {
  const ip = request.headers.get("CF-Connecting-IP") || "";

  const originHeaders = new Headers(request.headers);
  originHeaders.delete("cookie");
  originHeaders.set("X-Forwarded-For", ip);

  const originRequest = new Request(`https://${API_HOST}${pathWithSearch}`, {
    method: request.method,
    headers: originHeaders,
    body:
      request.method !== "GET" && request.method !== "HEAD" ? await request.arrayBuffer() : null,
    redirect: request.redirect,
  });

  return await fetch(originRequest);
}

export default {
  async fetch(request: Request, _env: unknown, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const pathWithSearch = url.pathname + url.search;

    if (url.pathname.startsWith("/static/")) {
      return retrieveStatic(request, pathWithSearch, ctx);
    }

    return forwardRequest(request, pathWithSearch);
  },
};
