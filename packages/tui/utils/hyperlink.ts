/**
 * Creates a clickable hyperlink in the terminal using OSC 8 escape sequences.
 * This makes URLs clickable in modern terminal emulators (Cmd+Click or Ctrl+Click).
 * Works in iTerm2, Terminal.app, VS Code terminal, and other modern terminals.
 *
 * @param url - The URL to make clickable
 * @param text - Optional text to display (defaults to the URL)
 * @param color - Optional ANSI color code to style the link (e.g., "1;34" for bold blue)
 * @returns A string with terminal escape sequences for a clickable link
 */
export function createHyperlink(url: string, text?: string, color?: string): string {
  const displayText = text || url;
  // OSC 8 escape sequence format: ESC]8;;URLSTTEXTSTESC]8;;ST
  // Using \x1b for ESC, \x1b\\ for ST (String Terminator - ESC backslash)
  // Format: \x1b]8;;URL\x1b\\TEXT\x1b]8;;\x1b\\
  const colorCode = color ? `\x1b[${color}m` : "";
  const resetCode = color ? "\x1b[0m" : "";
  return `\x1b]8;;${url}\x1b\\${colorCode}${displayText}${resetCode}\x1b]8;;\x1b\\`;
}
