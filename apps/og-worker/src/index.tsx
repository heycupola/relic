import { cache, ImageResponse } from "@cf-wasm/og/workerd";
import geistSans400 from "../assets/geist-sans-400.bin";
import geistSans600 from "../assets/geist-sans-600.bin";

const OG_SIZE = {
  width: 1200,
  height: 630,
} as const;

const BG = "#0e0e0e";
const FG = "#fafaf9";
const MUTED = "rgba(250, 250, 249, 0.52)";
const HAIRLINE = "rgba(250, 250, 249, 0.08)";
const CACHE_CONTROL = "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800";
const CACHE_NAME = "relic-og-v3";

const FONTS = [
  { name: "Geist", data: geistSans400, weight: 400, style: "normal" },
  { name: "Geist", data: geistSans600, weight: 600, style: "normal" },
] as const;

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

function getTitleFontSize(title: string): number {
  if (title.length <= 24) return 96;
  if (title.length <= 48) return 76;
  if (title.length <= 80) return 64;
  return 54;
}

function Wordmark({ height }: { height: number }) {
  return (
    <svg width={(height * 256) / 103} height={height} viewBox="0 0 256 103" fill="none">
      <path
        d="M0 103V30.2949H14.7893V38.8485H17.1321C18.3036 35.8007 20.1583 33.5886 22.6964 32.2121C25.3321 30.7374 28.5536 30 32.3607 30H41V43.7152H31.775C26.894 43.7152 22.8917 45.0916 19.7679 47.8444C16.644 50.499 15.0821 54.6283 15.0821 60.2323V103H0Z"
        fill={FG}
      />
      <path
        d="M86.1901 103C78.7521 103 72.2562 101.473 66.7025 98.4184C61.1488 95.2655 56.7851 90.881 53.6116 85.2649C50.5372 79.5502 49 72.9488 49 65.4607V63.6871C49 56.1004 50.5372 49.499 53.6116 43.8829C56.686 38.1683 60.9504 33.7838 66.405 30.7294C71.9587 27.5765 78.3554 26 85.595 26C92.6364 26 98.7851 27.5765 104.041 30.7294C109.397 33.7838 113.562 38.0697 116.537 43.5873C119.512 49.1049 121 55.5585 121 62.9482V68.7121H64.6198C64.8182 75.1164 66.9504 80.2399 71.0165 84.0825C75.1818 87.8266 80.3388 89.6986 86.4876 89.6986C92.2397 89.6986 96.5537 88.4178 99.4298 85.856C102.405 83.2943 104.686 80.3385 106.273 76.9885L118.917 83.4914C117.529 86.2502 115.496 89.1567 112.818 92.2111C110.24 95.2655 106.818 97.8273 102.554 99.8964C98.2893 101.965 92.8347 103 86.1901 103ZM64.7686 57.0365H105.38C104.983 51.5189 103 47.2329 99.4298 44.1785C95.8595 41.0256 91.1983 39.4491 85.4463 39.4491C79.6942 39.4491 74.9835 41.0256 71.3141 44.1785C67.7438 47.2329 65.562 51.5189 64.7686 57.0365Z"
        fill={FG}
      />
      <path d="M129 103V0H145V103H129Z" fill={FG} />
      <path
        d="M155.944 103V30.4586H171.901V103H155.944ZM164 20.6C160.901 20.6 158.268 19.6681 156.099 17.8043C154.033 15.8424 153 13.341 153 10.3C153 7.25905 154.033 4.80667 156.099 2.94286C158.268 0.980952 160.901 0 164 0C167.202 0 169.836 0.980952 171.901 2.94286C173.967 4.80667 175 7.25905 175 10.3C175 13.341 173.967 15.8424 171.901 17.8043C169.836 19.6681 167.202 20.6 164 20.6Z"
        fill={FG}
      />
      <path
        d="M220.161 103C213.209 103 206.893 101.522 201.213 98.5662C195.632 95.6104 191.176 91.3244 187.847 85.7083C184.616 80.0921 183 73.3429 183 65.4606V63.5393C183 55.6571 184.616 48.9571 187.847 43.4395C191.176 37.8234 195.632 33.5374 201.213 30.5816C206.893 27.5272 213.209 26 220.161 26C227.113 26 233.038 27.2809 237.934 29.8426C242.83 32.4043 246.746 35.8036 249.684 40.0403C252.72 44.277 254.678 48.9571 255.559 54.0806L240.871 57.1843C240.382 53.9328 239.353 50.977 237.787 48.3167C236.22 45.6564 234.017 43.5381 231.177 41.9616C228.337 40.3852 224.763 39.5969 220.455 39.5969C216.244 39.5969 212.425 40.5822 208.998 42.5528C205.669 44.4248 203.025 47.1836 201.066 50.8292C199.108 54.3762 198.129 58.7114 198.129 63.8349V65.1651C198.129 70.2885 199.108 74.6731 201.066 78.3186C203.025 81.9642 205.669 84.723 208.998 86.595C212.425 88.467 216.244 89.4031 220.455 89.4031C226.82 89.4031 231.667 87.7774 234.996 84.5259C238.325 81.1759 240.431 76.9392 241.312 71.8157L256 75.215C254.825 80.2399 252.72 84.8708 249.684 89.1075C246.746 93.3442 242.83 96.7434 237.934 99.3052C233.038 101.768 227.113 103 220.161 103Z"
        fill={FG}
      />
    </svg>
  );
}

function renderCard({ title, description }: OgImageOptions) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        padding: "72px 80px",
        backgroundColor: BG,
        backgroundImage:
          "radial-gradient(circle at 100% 0%, rgba(250, 250, 249, 0.07) 0%, rgba(250, 250, 249, 0) 55%)",
        fontFamily: "Geist",
        color: FG,
      }}
    >
      <div style={{ display: "flex" }}>
        <Wordmark height={30} />
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          flexGrow: 1,
        }}
      >
        <div
          style={{
            display: "block",
            maxWidth: "980px",
            fontSize: `${getTitleFontSize(title)}px`,
            fontWeight: 600,
            letterSpacing: "-0.04em",
            lineHeight: 1.04,
            lineClamp: 3,
            paddingBottom: "0.08em",
          }}
        >
          {title}
        </div>

        {description ? (
          <div
            style={{
              display: "block",
              maxWidth: "820px",
              marginTop: "24px",
              paddingTop: "24px",
              borderTop: `1px solid ${HAIRLINE}`,
              fontSize: "26px",
              lineHeight: 1.45,
              color: MUTED,
              lineClamp: 2,
            }}
          >
            {description}
          </div>
        ) : null}
      </div>
    </div>
  );
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
      fonts: [...FONTS],
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
