import { ImageResponse } from "next/og";
import type { ReactElement } from "react";

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

import { readFile } from "node:fs/promises";
import { join } from "node:path";

let fontCache: { mono: ArrayBuffer; sans: ArrayBuffer; sansBold: ArrayBuffer } | null = null;

async function loadFonts() {
  if (fontCache) return fontCache;
  const fontsDir = join(process.cwd(), "public", "fonts");
  const [mono, sans, sansBold] = await Promise.all([
    readFile(join(fontsDir, "geist-mono-400.woff")).then((b) => b.buffer as ArrayBuffer),
    readFile(join(fontsDir, "geist-sans-400.woff")).then((b) => b.buffer as ArrayBuffer),
    readFile(join(fontsDir, "geist-sans-600.woff")).then((b) => b.buffer as ArrayBuffer),
  ]);
  fontCache = { mono, sans, sansBold };
  return fontCache;
}

export async function createOgImage({
  eyebrow,
  title,
  description,
  footer = "relic.so",
}: OgImageOptions) {
  const fonts = await loadFonts();

  const element: ReactElement = (
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
              textTransform: "uppercase",
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
              textTransform: "uppercase",
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
              textTransform: "uppercase",
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
  );

  return new ImageResponse(element, {
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
    headers: {
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  });
}
