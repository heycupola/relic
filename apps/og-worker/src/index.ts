import { ImageResponse } from "workers-og";

const SITE_URL = "https://relic.so";

const BG = "#242424";
const FG = "#FAFAF9";
const BORDER = "#3E3E3E";
const MUTED = "#ABABAB";

interface OgOptions {
  eyebrow: string;
  title: string;
  description: string;
  footer?: string;
}

let fontCache: { mono: ArrayBuffer; sans: ArrayBuffer; sansBold: ArrayBuffer } | null = null;

async function loadFonts() {
  if (fontCache) return fontCache;
  const [mono, sans, sansBold] = await Promise.all([
    fetch(`${SITE_URL}/fonts/geist-mono-400.woff`).then((r) => r.arrayBuffer()),
    fetch(`${SITE_URL}/fonts/geist-sans-400.woff`).then((r) => r.arrayBuffer()),
    fetch(`${SITE_URL}/fonts/geist-sans-600.woff`).then((r) => r.arrayBuffer()),
  ]);
  fontCache = { mono, sans, sansBold };
  return fontCache;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildHtml({ eyebrow, title, description, footer = "relic.so" }: OgOptions): string {
  return `<div style="display:flex;width:100%;height:100%;background:${BG}">
  <div style="display:flex;width:2px;height:100%;background:${BORDER}"></div>
  <div style="display:flex;flex-direction:column;flex-grow:1;height:100%">
    <div style="display:flex;width:100%;height:2px;background:${BORDER}"></div>
    <div style="display:flex;align-items:center;justify-content:space-between;padding:0 48px;height:56px;border-bottom:2px solid ${BORDER}">
      <span style="font-family:'Geist Mono';font-size:13px;letter-spacing:0.22em;color:${MUTED};text-transform:uppercase">${esc(eyebrow)}</span>
      <span style="font-family:'Geist Mono';font-size:13px;letter-spacing:0.22em;color:${MUTED};text-transform:uppercase">${esc(footer)}</span>
    </div>
    <div style="display:flex;flex-direction:column;flex-grow:1;padding:48px 48px 0 48px;overflow:hidden">
      <div style="display:flex;font-family:'Geist Sans';font-size:64px;font-weight:600;letter-spacing:-0.03em;line-height:1.1;color:${FG};max-height:300px;overflow:hidden">${esc(title)}</div>
      <div style="display:flex;font-family:'Geist Sans';font-size:24px;line-height:1.5;color:${MUTED};margin-top:24px;max-height:112px;overflow:hidden">${esc(description)}</div>
    </div>
    <div style="display:flex;align-items:center;padding:0 48px;height:56px;border-top:2px solid ${BORDER}">
      <div style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;background:${FG}">
        <span style="font-family:'Geist Sans';font-size:16px;font-weight:600;color:${BG}">r</span>
      </div>
      <span style="font-family:'Geist Mono';font-size:13px;letter-spacing:0.22em;color:${MUTED};text-transform:uppercase;margin-left:14px">Encrypted on your device</span>
    </div>
    <div style="display:flex;width:100%;height:2px;background:${BORDER}"></div>
  </div>
  <div style="display:flex;width:2px;height:100%;background:${BORDER}"></div>
</div>`;
}

async function generateOg(options: OgOptions): Promise<Response> {
  const fonts = await loadFonts();
  return new ImageResponse(buildHtml(options), {
    width: 1200,
    height: 630,
    fonts: [
      { name: "Geist Mono", data: fonts.mono, weight: 400, style: "normal" },
      { name: "Geist Sans", data: fonts.sans, weight: 400, style: "normal" },
      { name: "Geist Sans", data: fonts.sansBold, weight: 600, style: "normal" },
    ],
    headers: {
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
      "Access-Control-Allow-Origin": SITE_URL,
    },
  });
}

const STATIC_PAGES: Record<string, OgOptions> = {
  home: {
    eyebrow: "relic",
    title: "The secrets layer developers actually trust",
    description:
      "Manage and share secrets. Encrypted on your device, never exposed to anyone else. Not even us.",
  },
  "blog-index": {
    eyebrow: "Blog",
    title: "Blog",
    description: "Product notes, design decisions, and technical writing about building relic.",
  },
  "changelog-index": {
    eyebrow: "Changelog",
    title: "Changelog",
    description: "Release notes, product improvements, and shipping updates from relic.",
  },
};

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const type = url.searchParams.get("type");

    if (!type) {
      return new Response("Missing type parameter", { status: 400 });
    }

    const staticPage = STATIC_PAGES[type];
    if (staticPage) {
      return generateOg(staticPage);
    }

    const slug = url.searchParams.get("slug");

    if ((type === "blog-entry" || type === "changelog-entry") && slug) {
      return generateOg({
        eyebrow: type === "blog-entry" ? "Blog" : "Changelog",
        title: decodeURIComponent(slug)
          .replace(/-/g, " ")
          .replace(/^\w/, (c) => c.toUpperCase()),
        description: type === "blog-entry" ? "Read on the relic blog" : "View release notes",
      });
    }

    return new Response("Not found", { status: 404 });
  },
};
