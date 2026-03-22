import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { initWasm, Resvg } from "@resvg/resvg-wasm";
import type { ReactNode } from "react";
import satori from "satori";

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
let wasmInitialized = false;

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

async function ensureWasm() {
  if (wasmInitialized) return;
  const wasmPath = join(process.cwd(), "node_modules", "@resvg", "resvg-wasm", "index_bg.wasm");
  const wasmBuffer = await readFile(wasmPath);
  await initWasm(wasmBuffer);
  wasmInitialized = true;
}

function OgLayout({ eyebrow, title, description, footer }: Required<OgImageOptions>): ReactNode {
  return (
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
              style={{ fontFamily: "Geist Sans", fontSize: "16px", fontWeight: 600, color: BG }}
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
}

export async function generateOgPng(options: OgImageOptions): Promise<Buffer> {
  const fonts = await loadFonts();
  await ensureWasm();

  const element = OgLayout({
    eyebrow: options.eyebrow,
    title: options.title,
    description: options.description,
    footer: options.footer ?? "relic.so",
  });

  const svg = await satori(element as React.ReactElement, {
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
  });

  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: OG_IMAGE_SIZE.width },
  });
  return Buffer.from(resvg.render().asPng());
}
