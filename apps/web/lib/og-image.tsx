import { ImageResponse } from "next/og";

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

const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="103 96 28 32" width="28" height="32"><path d="M103.125 128V96.1293H116.375V99.8788H118.474C119.523 98.5427 120.727 97.5732 122.086 96.9702C123.497 96.3232 125.221 96 127.256 96H130.875V102.012H126.751C124.606 102.012 122.89 102.617 121.605 103.829C120.32 105.001 119.678 106.846 119.678 109.364V128H103.125Z" fill="#0E0E0E"/></svg>`;
const LOGO_DATA_URI = `data:image/svg+xml,${encodeURIComponent(LOGO_SVG)}`;

export function createOgImage({
  eyebrow,
  title,
  description,
  footer = "Encrypted on your device",
}: OgImageOptions) {
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        backgroundColor: "#050505",
        padding: "44px",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          border: "1px solid rgba(250,250,249,0.09)",
          padding: "36px",
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "64px",
              height: "64px",
              backgroundColor: "#FAFAF9",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={LOGO_DATA_URI} width={28} height={32} alt="" />
          </div>
          <span
            style={{
              marginLeft: "26px",
              color: "rgba(250,250,249,0.52)",
              fontSize: "14px",
              letterSpacing: "4.8px",
              textTransform: "uppercase" as const,
            }}
          >
            {eyebrow}
          </span>
        </div>

        <div
          style={{
            display: "flex",
            color: "#FAFAF9",
            fontSize: "68px",
            fontWeight: 600,
            letterSpacing: "-2.72px",
            marginTop: "50px",
            lineHeight: 1.12,
            overflow: "hidden",
            maxHeight: "310px",
          }}
        >
          {title}
        </div>

        <div
          style={{
            display: "flex",
            color: "rgba(250,250,249,0.64)",
            fontSize: "28px",
            marginTop: "28px",
            lineHeight: 1.4,
            overflow: "hidden",
            maxHeight: "120px",
          }}
        >
          {description}
        </div>

        <div
          style={{
            display: "flex",
            marginTop: "auto",
            borderTop: "1px solid rgba(250,250,249,0.09)",
            paddingTop: "16px",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span
            style={{
              color: "rgba(250,250,249,0.42)",
              fontSize: "18px",
              letterSpacing: "4.2px",
            }}
          >
            relic
          </span>
          <span
            style={{
              color: "rgba(250,250,249,0.42)",
              fontSize: "18px",
            }}
          >
            {footer}
          </span>
        </div>
      </div>
    </div>,
    { ...OG_IMAGE_SIZE },
  );
}
