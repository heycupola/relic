import { ImageResponse } from "next/og";

export const OG_IMAGE_SIZE = {
  width: 1200,
  height: 630,
} as const;

export interface OgImageOptions {
  eyebrow: string;
  title: string;
  description: string;
  footer?: string;
}

const BG = "#242424";
const FG = "#FAFAF9";
const BORDER = "#3E3E3E";
const MUTED = "#ABABAB";

let fontCache: { mono: ArrayBuffer; sans: ArrayBuffer; sansBold: ArrayBuffer } | null = null;

async function loadGoogleFont(family: string, weight: number): Promise<ArrayBuffer> {
  const css = await fetch(
    `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}&display=swap`,
    { headers: { "User-Agent": "Mozilla/5.0 (compatible; OG Image Generator)" } },
  ).then((r) => r.text());

  const match = css.match(/src:\s*url\(([^)]+)\)/);
  if (!match?.[1]) throw new Error(`Failed to load font: ${family} ${weight}`);
  return fetch(match[1]).then((r) => r.arrayBuffer());
}

async function loadFonts() {
  if (fontCache) return fontCache;
  const [mono, sans, sansBold] = await Promise.all([
    loadGoogleFont("Geist Mono", 400),
    loadGoogleFont("Geist", 400),
    loadGoogleFont("Geist", 600),
  ]);
  fontCache = { mono, sans, sansBold };
  return fontCache;
}

export async function createOgImage({
  eyebrow,
  title,
  description,
  footer = "relic.so",
}: OgImageOptions): Promise<Response> {
  const fonts = await loadFonts();

  return new ImageResponse(
    <div style={{ display: "flex", width: "100%", height: "100%", backgroundColor: BG }}>
      <div style={{ display: "flex", width: "2px", height: "100%", backgroundColor: BORDER }} />

      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, height: "100%" }}>
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
              fontFamily: "Geist",
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
              fontFamily: "Geist",
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
            <span style={{ fontFamily: "Geist", fontSize: "16px", fontWeight: 600, color: BG }}>
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
    </div>,
    {
      ...OG_IMAGE_SIZE,
      fonts: [
        { name: "Geist Mono", data: fonts.mono, weight: 400 as const, style: "normal" as const },
        { name: "Geist", data: fonts.sans, weight: 400 as const, style: "normal" as const },
        { name: "Geist", data: fonts.sansBold, weight: 600 as const, style: "normal" as const },
      ],
      headers: {
        "Cache-Control": "public, max-age=86400, s-maxage=86400",
      },
    },
  );
}
