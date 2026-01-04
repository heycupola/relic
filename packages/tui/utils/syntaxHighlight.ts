import { THEME_COLORS } from "./constants";

interface HighlightedPart {
  text: string;
  color: string;
}

export function highlightEnvLine(line: string): HighlightedPart[] {
  const parts: HighlightedPart[] = [];

  if (line.trimStart().startsWith("#")) {
    parts.push({ text: line, color: THEME_COLORS.textMuted });
    return parts;
  }

  if (line.trim() === "") {
    parts.push({ text: line || " ", color: THEME_COLORS.text });
    return parts;
  }

  const equalsIndex = line.indexOf("=");
  if (equalsIndex > 0) {
    const key = line.slice(0, equalsIndex);
    const equals = "=";
    const value = line.slice(equalsIndex + 1);

    parts.push({ text: key, color: THEME_COLORS.primary });
    parts.push({ text: equals, color: THEME_COLORS.textMuted });
    parts.push({ text: value, color: THEME_COLORS.secondary });
  } else {
    parts.push({ text: line, color: THEME_COLORS.text });
  }

  return parts;
}

export function highlightJsonLine(line: string): HighlightedPart[] {
  const parts: HighlightedPart[] = [];
  let remaining = line;

  while (remaining.length > 0) {
    const wsMatch = remaining.match(/^(\s+)/);
    if (wsMatch?.[1]) {
      parts.push({ text: wsMatch[1], color: THEME_COLORS.text });
      remaining = remaining.slice(wsMatch[1].length);
      continue;
    }

    const firstChar = remaining[0];
    if (firstChar && /^[[\]{}:,]/.test(firstChar)) {
      parts.push({ text: firstChar, color: THEME_COLORS.textMuted });
      remaining = remaining.slice(1);
      continue;
    }

    const stringMatch = remaining.match(/^"([^"\\]|\\.)*"/);
    if (stringMatch) {
      const str = stringMatch[0];
      const afterStr = remaining.slice(str.length).trim();
      if (afterStr.startsWith(":")) {
        parts.push({ text: str, color: THEME_COLORS.primary });
      } else {
        parts.push({ text: str, color: THEME_COLORS.secondary });
      }
      remaining = remaining.slice(str.length);
      continue;
    }

    const numMatch = remaining.match(/^-?\d+(\.\d+)?([eE][+-]?\d+)?/);
    if (numMatch) {
      parts.push({ text: numMatch[0], color: THEME_COLORS.accent });
      remaining = remaining.slice(numMatch[0].length);
      continue;
    }

    const keywordMatch = remaining.match(/^(true|false|null)\b/);
    if (keywordMatch) {
      parts.push({ text: keywordMatch[0], color: THEME_COLORS.success });
      remaining = remaining.slice(keywordMatch[0].length);
      continue;
    }

    if (firstChar) {
      parts.push({ text: firstChar, color: THEME_COLORS.text });
      remaining = remaining.slice(1);
    }
  }

  return parts.length === 0 ? [{ text: " ", color: THEME_COLORS.text }] : parts;
}

export function highlightLine(line: string, format: "env" | "json"): HighlightedPart[] {
  return format === "env" ? highlightEnvLine(line) : highlightJsonLine(line);
}
