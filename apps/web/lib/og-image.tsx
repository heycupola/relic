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

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function wrapText(text: string, maxCharsPerLine: number): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (candidate.length > maxCharsPerLine && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = candidate;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

function renderTextLines(lines: string[], x: number, lineHeight: number) {
  return lines
    .map(
      (line, index) =>
        `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`,
    )
    .join("");
}

export function createOgImage({
  eyebrow,
  title,
  description,
  footer = "Encrypted on your device",
}: OgImageOptions) {
  const titleLines = wrapText(title, 24).slice(0, 4);
  const titleBlockHeight = Math.max(1, titleLines.length) * 76;
  const descriptionY = 210 + titleBlockHeight + 28;
  const descriptionLines = wrapText(description, 52).slice(0, 3);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${OG_IMAGE_SIZE.width}" height="${OG_IMAGE_SIZE.height}" viewBox="0 0 ${OG_IMAGE_SIZE.width} ${OG_IMAGE_SIZE.height}" fill="none">
      <rect width="${OG_IMAGE_SIZE.width}" height="${OG_IMAGE_SIZE.height}" fill="#050505" />
      <rect x="44" y="44" width="1112" height="542" fill="#050505" stroke="rgba(250,250,249,0.09)" />
      <rect x="80" y="80" width="64" height="64" fill="#FAFAF9" />
      <path d="M103.125 128V96.1293H116.375V99.8788H118.474C119.523 98.5427 120.727 97.5732 122.086 96.9702C123.497 96.3232 125.221 96 127.256 96H130.875V102.012H126.751C124.606 102.012 122.89 102.617 121.605 103.829C120.32 105.001 119.678 106.846 119.678 109.364V128H103.125Z" fill="#0E0E0E"/>
      <text x="170" y="121" fill="rgba(250,250,249,0.52)" font-family="Inter, Arial, sans-serif" font-size="14" letter-spacing="4.8">${escapeXml(
        eyebrow.toUpperCase(),
      )}</text>
      <text x="80" y="210" fill="#FAFAF9" font-family="Inter, Arial, sans-serif" font-size="68" font-weight="600" letter-spacing="-2.72">
        ${renderTextLines(titleLines, 80, 76)}
      </text>
      <text x="80" y="${descriptionY}" fill="rgba(250,250,249,0.64)" font-family="Inter, Arial, sans-serif" font-size="28">
        ${renderTextLines(descriptionLines, 80, 38)}
      </text>
      <line x1="80" y1="534" x2="1120" y2="534" stroke="rgba(250,250,249,0.09)" />
      <text x="80" y="568" fill="rgba(250,250,249,0.42)" font-family="Inter, Arial, sans-serif" font-size="18" letter-spacing="4.2">relic</text>
      <text x="1120" y="568" text-anchor="end" fill="rgba(250,250,249,0.42)" font-family="Inter, Arial, sans-serif" font-size="18">${escapeXml(
        footer,
      )}</text>
    </svg>
  `;

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}
