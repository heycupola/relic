import { THEME_COLORS } from "./constants";

interface HighlightedPart {
    text: string;
    color: string;
}

/**
 * Syntax highlight a single line for .env format
 * Colors: comments=muted, keys=primary, equals=muted, values=secondary
 */
export function highlightEnvLine(line: string): HighlightedPart[] {
    const parts: HighlightedPart[] = [];

    // Comment lines
    if (line.trimStart().startsWith("#")) {
        parts.push({ text: line, color: THEME_COLORS.textMuted });
        return parts;
    }

    // Empty lines
    if (line.trim() === "") {
        parts.push({ text: line || " ", color: THEME_COLORS.text });
        return parts;
    }

    // KEY=VALUE format
    const equalsIndex = line.indexOf("=");
    if (equalsIndex > 0) {
        const key = line.slice(0, equalsIndex);
        const equals = "=";
        const value = line.slice(equalsIndex + 1);

        parts.push({ text: key, color: THEME_COLORS.primary });      // Blue for keys
        parts.push({ text: equals, color: THEME_COLORS.textMuted }); // Visible muted for =
        parts.push({ text: value, color: THEME_COLORS.secondary });  // Purple for values
    } else {
        parts.push({ text: line, color: THEME_COLORS.text });
    }

    return parts;
}

/**
 * Syntax highlight a single line for JSON format
 * Colors: brackets=muted, keys=primary, strings=secondary, numbers=accent, booleans=success
 */
export function highlightJsonLine(line: string): HighlightedPart[] {
    const parts: HighlightedPart[] = [];
    let remaining = line;

    while (remaining.length > 0) {
        // Whitespace at start
        const wsMatch = remaining.match(/^(\s+)/);
        if (wsMatch) {
            parts.push({ text: wsMatch[1], color: THEME_COLORS.text });
            remaining = remaining.slice(wsMatch[1].length);
            continue;
        }

        // Brackets, braces, colon, comma - use textMuted for visibility
        if (/^[\[\]{}:,]/.test(remaining)) {
            parts.push({ text: remaining[0], color: THEME_COLORS.textMuted });
            remaining = remaining.slice(1);
            continue;
        }

        // Quoted string (key or value)
        const stringMatch = remaining.match(/^"([^"\\]|\\.)*"/);
        if (stringMatch) {
            const str = stringMatch[0];
            // Check if this is a key (followed by :)
            const afterStr = remaining.slice(str.length).trim();
            if (afterStr.startsWith(":")) {
                // It's a key - use primary (blue)
                parts.push({ text: str, color: THEME_COLORS.primary });
            } else {
                // It's a string value - use secondary (purple)
                parts.push({ text: str, color: THEME_COLORS.secondary });
            }
            remaining = remaining.slice(str.length);
            continue;
        }

        // Numbers - use accent (orange/yellow)
        const numMatch = remaining.match(/^-?\d+(\.\d+)?([eE][+-]?\d+)?/);
        if (numMatch) {
            parts.push({ text: numMatch[0], color: THEME_COLORS.accent });
            remaining = remaining.slice(numMatch[0].length);
            continue;
        }

        // Booleans and null - use success (green)
        const keywordMatch = remaining.match(/^(true|false|null)\b/);
        if (keywordMatch) {
            parts.push({ text: keywordMatch[0], color: THEME_COLORS.success });
            remaining = remaining.slice(keywordMatch[0].length);
            continue;
        }

        // Any other character
        parts.push({ text: remaining[0], color: THEME_COLORS.text });
        remaining = remaining.slice(1);
    }

    return parts.length === 0 ? [{ text: " ", color: THEME_COLORS.text }] : parts;
}

/**
 * Highlight a line based on format
 */
export function highlightLine(line: string, format: "env" | "json"): HighlightedPart[] {
    return format === "env" ? highlightEnvLine(line) : highlightJsonLine(line);
}
