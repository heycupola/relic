import { cache, ImageResponse } from "@cf-wasm/og/workerd";
import homeDesertPng from "../assets/home-desert.bin";

const OG_SIZE = {
  width: 1200,
  height: 630,
} as const;

const BG = "#0a0a0a";
const FG = "#fafafa";
const BORDER = "#262626";
const SOFT_TEXT = "rgba(250, 250, 250, 0.6)";
const CHROME_TEXT = "rgba(250, 250, 250, 0.5)";
const CACHE_CONTROL = "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800";
const CACHE_NAME = "relic-og";
const HOME_DESERT_DATA_URL = arrayBufferToDataUrl(homeDesertPng, "image/jpeg");

type StaticPageType = "home" | "blog-index" | "changelog-index";
type EntryPageType = "blog-entry" | "changelog-entry";

interface OgImageOptions {
  type: StaticPageType | EntryPageType;
  title: string;
  description: string;
}

const STATIC_IMAGES: Record<StaticPageType, OgImageOptions> = {
  home: {
    type: "home",
    title: "The secrets layer developers actually trust",
    description:
      "Manage and share secrets. Encrypted on your device, never exposed to anyone else. Not even us.",
  },
  "blog-index": {
    type: "blog-index",
    title: "Blog",
    description: "Product notes, design decisions, and technical writing about building relic.",
  },
  "changelog-index": {
    type: "changelog-index",
    title: "Changelog",
    description: "Release notes, product improvements, and shipping updates from relic.",
  },
};

function stripControlCharacters(value: string): string {
  return Array.from(value, (char) => {
    const code = char.charCodeAt(0);
    return code < 32 || code === 127 ? " " : char;
  }).join("");
}

function normalizeText(value: string | null, maxLength: number, fallback = ""): string {
  const normalized = stripControlCharacters(value ?? fallback)
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return fallback;
  return normalized.slice(0, maxLength).trim();
}

function arrayBufferToDataUrl(buffer: ArrayBuffer, mimeType: string): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return `data:${mimeType};base64,${btoa(binary)}`;
}

function createBadRequest(message: string): Response {
  return new Response(message, {
    status: 400,
    headers: {
      "Cache-Control": "public, max-age=60, s-maxage=60",
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

function resolveImageOptions(url: URL): OgImageOptions | Response {
  const type = url.searchParams.get("type");
  if (!type) return createBadRequest("Missing type");

  if (type === "home" || type === "blog-index" || type === "changelog-index") {
    return STATIC_IMAGES[type];
  }

  if (type === "blog-entry" || type === "changelog-entry") {
    const title = normalizeText(url.searchParams.get("title"), 140);
    if (!title) return createBadRequest("Missing title");

    return {
      type,
      title,
      description: normalizeText(url.searchParams.get("description"), 220),
    };
  }

  return createBadRequest(`Unsupported type: ${type}`);
}

function renderFrame({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        position: "relative",
        width: "100%",
        height: "100%",
        backgroundColor: BORDER,
      }}
    >
      <div
        style={{
          display: "flex",
          position: "absolute",
          top: "2px",
          right: "2px",
          bottom: "2px",
          left: "2px",
          flexDirection: "column",
          minWidth: 0,
          backgroundColor: BG,
          overflow: "hidden",
        }}
      >
        {children}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "0 48px",
            height: "56px",
            borderTop: `2px solid ${BORDER}`,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "28px",
              height: "28px",
              backgroundColor: FG,
              color: BG,
              fontSize: "16px",
              fontWeight: 700,
            }}
          >
            r
          </div>
          <span
            style={{
              display: "flex",
              marginLeft: "14px",
              fontSize: "13px",
              fontWeight: 600,
              letterSpacing: "0.22em",
              color: CHROME_TEXT,
              textTransform: "uppercase",
            }}
          >
            Encrypted on your device
          </span>
        </div>
      </div>
    </div>
  );
}

function renderDefaultCard({ title, description }: OgImageOptions) {
  return renderFrame({
    children: (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flexGrow: 1,
          padding: "56px 48px 0 48px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            position: "relative",
            zIndex: 1,
            paddingBottom: "0.18em",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: "64px",
              fontWeight: 700,
              letterSpacing: "-0.03em",
              lineHeight: 1.1,
              color: FG,
              paddingRight: "0.08em",
            }}
          >
            {title}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            fontSize: "24px",
            lineHeight: 1.5,
            color: SOFT_TEXT,
            marginTop: "24px",
            maxHeight: "112px",
            overflow: "hidden",
          }}
        >
          {description}
        </div>
      </div>
    ),
  });
}

function renderHomeCard({ title, description }: OgImageOptions) {
  return renderFrame({
    children: (
      <div
        style={{
          display: "flex",
          flexGrow: 1,
          padding: "48px 48px 0 48px",
          gap: "24px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            width: "56%",
            minWidth: "0",
            paddingBottom: "32px",
          }}
        >
          <div
            style={{
              display: "flex",
              paddingBottom: "0.18em",
            }}
          >
            <div
              style={{
                display: "flex",
                fontSize: "76px",
                fontWeight: 700,
                letterSpacing: "-0.05em",
                lineHeight: 1.02,
                color: FG,
                maxHeight: "255px",
                overflow: "hidden",
                paddingRight: "0.08em",
              }}
            >
              {title}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              marginTop: "18px",
              fontSize: "24px",
              lineHeight: 1.5,
              color: SOFT_TEXT,
              maxWidth: "560px",
              overflow: "hidden",
            }}
          >
            {description}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            width: "44%",
            minWidth: "0",
            paddingBottom: "32px",
            overflow: "hidden",
          }}
        >
          <img
            src={HOME_DESERT_DATA_URL}
            alt=""
            style={{
              display: "flex",
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        </div>
      </div>
    ),
  });
}

function renderCard(options: OgImageOptions) {
  return options.type === "home" ? renderHomeCard(options) : renderDefaultCard(options);
}

function createHeadResponse(response: Response): Response {
  return new Response(null, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

export default {
  async fetch(request: Request, _env: unknown, ctx: ExecutionContext): Promise<Response> {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", {
        status: 405,
        headers: { Allow: "GET, HEAD" },
      });
    }

    const url = new URL(request.url);
    if (url.pathname !== "/" && url.pathname !== "/og") {
      return new Response("Not found", { status: 404 });
    }

    const isLocalRequest = url.hostname === "127.0.0.1" || url.hostname === "localhost";
    const cacheStorage = isLocalRequest ? null : await caches.open(CACHE_NAME);
    const cacheKey = new Request(url.toString(), { method: "GET" });
    const cached = cacheStorage ? await cacheStorage.match(cacheKey) : null;
    if (cached) {
      return request.method === "HEAD" ? createHeadResponse(cached) : cached;
    }

    const options = resolveImageOptions(url);
    if (options instanceof Response) {
      return options;
    }

    cache.setExecutionContext(ctx);

    const response = await ImageResponse.async(renderCard(options), {
      ...OG_SIZE,
      headers: {
        "Cache-Control": isLocalRequest ? "no-store" : CACHE_CONTROL,
      },
    });

    if (cacheStorage) {
      ctx.waitUntil(cacheStorage.put(cacheKey, response.clone()));
    }

    return request.method === "HEAD" ? createHeadResponse(response) : response;
  },
} satisfies ExportedHandler;
