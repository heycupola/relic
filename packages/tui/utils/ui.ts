import { THEME_COLORS } from "./constants";

interface HighlightedPart {
  text: string;
  color: string;
}

function highlightEnvLine(line: string): HighlightedPart[] {
  if (line.trimStart().startsWith("#")) {
    return [{ text: line, color: THEME_COLORS.textMuted }];
  }

  if (line.trim() === "") {
    return [{ text: line || " ", color: THEME_COLORS.text }];
  }

  const equalsIndex = line.indexOf("=");
  if (equalsIndex > 0) {
    return [
      { text: line.slice(0, equalsIndex), color: THEME_COLORS.primary },
      { text: "=", color: THEME_COLORS.textMuted },
      { text: line.slice(equalsIndex + 1), color: THEME_COLORS.secondary },
    ];
  }

  return [{ text: line, color: THEME_COLORS.text }];
}

function highlightJsonLine(line: string): HighlightedPart[] {
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
      const color = afterStr.startsWith(":") ? THEME_COLORS.primary : THEME_COLORS.secondary;
      parts.push({ text: str, color });
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

export function wrapLine(line: string, maxWidth: number): string[] {
  if (line.length <= maxWidth) return [line];

  const result: string[] = [];
  let remaining = line;

  while (remaining.length > 0) {
    if (remaining.length <= maxWidth) {
      result.push(remaining);
      break;
    }

    let breakPoint = maxWidth;
    const segment = remaining.slice(0, maxWidth + 1);
    const lastSpace = segment.lastIndexOf(" ");

    if (lastSpace > 0 && lastSpace < maxWidth) {
      breakPoint = lastSpace;
    }

    result.push(remaining.slice(0, breakPoint));
    remaining = remaining.slice(breakPoint).trimStart();
  }

  return result;
}

export function mapCursorToWrappedLines(
  lines: string[],
  cursor: { line: number; column: number },
  maxWidth: number,
): {
  wrappedLine: number;
  wrappedColumn: number;
  allWrappedLines: string[];
} {
  const allWrappedLines: string[] = [];
  let wrappedLine = 0;
  let wrappedColumn = cursor.column;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] || "";
    const wrapped = wrapLine(line, maxWidth);

    if (i < cursor.line) {
      wrappedLine += wrapped.length;
      allWrappedLines.push(...wrapped);
    } else if (i === cursor.line) {
      let charCount = 0;
      for (let j = 0; j < wrapped.length; j++) {
        const wrappedSegment = wrapped[j] || "";
        if (charCount + wrappedSegment.length >= cursor.column) {
          wrappedColumn = cursor.column - charCount;
          break;
        }
        charCount += wrappedSegment.length;
        wrappedLine++;
      }
      allWrappedLines.push(...wrapped);
    } else {
      allWrappedLines.push(...wrapped);
    }
  }

  return { wrappedLine, wrappedColumn, allWrappedLines };
}

export function createHyperlink(url: string, text?: string, color?: string): string {
  const displayText = text || url;
  const colorCode = color ? `\x1b[${color}m` : "";
  const resetCode = color ? "\x1b[0m" : "";
  return `\x1b]8;;${url}\x1b\\${colorCode}${displayText}${resetCode}\x1b]8;;\x1b\\`;
}
