import { initWasm, Resvg } from "@resvg/resvg-wasm";
import type { ReactNode } from "react";
import satori from "satori";

export const OG_IMAGE_SIZE = {
  width: 1200,
  height: 630,
} as const;

interface OgImageOptions {
  eyebrow: string;
  title: string;
  description: string;
  footer?: string;
}

const BG = "#242424";
const FG = "#FAFAF9";
const BORDER = "#3E3E3E";
const MUTED = "#ABABAB";

const GEIST_MONO_URL =
  "https://cdn.jsdelivr.net/fontsource/fonts/geist-mono@latest/latin-400-normal.woff";
const GEIST_SANS_URL =
  "https://cdn.jsdelivr.net/fontsource/fonts/geist-sans@latest/latin-400-normal.woff";
const GEIST_SANS_SEMIBOLD_URL =
  "https://cdn.jsdelivr.net/fontsource/fonts/geist-sans@latest/latin-600-normal.woff";

let fontCache: { mono: ArrayBuffer; sans: ArrayBuffer; sansBold: ArrayBuffer } | null = null;

async function loadFonts() {
  if (fontCache) return fontCache;
  const [mono, sans, sansBold] = await Promise.all([
    fetch(GEIST_MONO_URL).then((r) => r.arrayBuffer()),
    fetch(GEIST_SANS_URL).then((r) => r.arrayBuffer()),
    fetch(GEIST_SANS_SEMIBOLD_URL).then((r) => r.arrayBuffer()),
  ]);
  fontCache = { mono, sans, sansBold };
  return fontCache;
}

let wasmInitialized = false;

async function ensureResvg() {
  if (wasmInitialized) return;
  const wasmResponse = await fetch("https://unpkg.com/@resvg/resvg-wasm@2.6.2/index_bg.wasm");
  await initWasm(wasmResponse);
  wasmInitialized = true;
}

export async function createOgImage({
  eyebrow,
  title,
  description,
  footer = "relic.so",
}: OgImageOptions) {
  const [fonts] = await Promise.all([loadFonts(), ensureResvg()]);

  const svg = await satori(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          backgroundColor: BG,
        }}
      >
        <div style={{ display: "flex", width: "2px", height: "100%", backgroundColor: BORDER }} />

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flexGrow: 1,
            height: "100%",
          }}
        >
          <div style={{ display: "flex", width: "100%", height: "2px", backgroundColor: BORDER }} />

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 48px",
              height: "56px",
              borderBottom: `2px solid ${BORDER}`,
            }}
          >
            <span
              style={{
                fontFamily: "Geist Mono",
                fontSize: "13px",
                letterSpacing: "0.22em",
                color: MUTED,
                textTransform: "uppercase" as const,
              }}
            >
              {eyebrow}
            </span>
            <span
              style={{
                fontFamily: "Geist Mono",
                fontSize: "13px",
                letterSpacing: "0.22em",
                color: MUTED,
                textTransform: "uppercase" as const,
              }}
            >
              {footer}
            </span>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flexGrow: 1,
              padding: "48px 48px 0 48px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                fontFamily: "Geist Sans",
                fontSize: "64px",
                fontWeight: 600,
                letterSpacing: "-0.03em",
                lineHeight: 1.1,
                color: FG,
                maxHeight: "300px",
                overflow: "hidden",
              }}
            >
              {title}
            </div>

            <div
              style={{
                display: "flex",
                fontFamily: "Geist Sans",
                fontSize: "24px",
                lineHeight: 1.5,
                color: MUTED,
                marginTop: "24px",
                maxHeight: "112px",
                overflow: "hidden",
              }}
            >
              {description}
            </div>
          </div>

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
              }}
            >
              <span
                style={{
                  fontFamily: "Geist Sans",
                  fontSize: "16px",
                  fontWeight: 600,
                  color: BG,
                }}
              >
                r
              </span>
            </div>
            <span
              style={{
                fontFamily: "Geist Mono",
                fontSize: "13px",
                letterSpacing: "0.22em",
                color: MUTED,
                textTransform: "uppercase" as const,
                marginLeft: "14px",
              }}
            >
              Encrypted on your device
            </span>
          </div>

          <div style={{ display: "flex", width: "100%", height: "2px", backgroundColor: BORDER }} />
        </div>

        <div style={{ display: "flex", width: "2px", height: "100%", backgroundColor: BORDER }} />
      </div>
    ) as ReactNode,
    {
      ...OG_IMAGE_SIZE,
      fonts: [
        { name: "Geist Mono", data: fonts.mono, weight: 400 as const, style: "normal" as const },
        { name: "Geist Sans", data: fonts.sans, weight: 400 as const, style: "normal" as const },
        {
          name: "Geist Sans",
          data: fonts.sansBold,
          weight: 600 as const,
          style: "normal" as const,
        },
      ],
    },
  );

  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: OG_IMAGE_SIZE.width },
  });
  const png = resvg.render().asPng();

  return new Response(png.buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  });
}
