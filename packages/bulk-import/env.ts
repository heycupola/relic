import { type BulkImportSecret, detectType } from "./validate";

export interface InvalidLine {
  line: number;
  message: string;
}

export interface DotenvParseResult {
  secrets: BulkImportSecret[];
  invalidLines: InvalidLine[];
}

const DOUBLE_QUOTE_ESCAPES: Record<string, string> = {
  n: "\n",
  r: "\r",
  t: "\t",
  '"': '"',
  "\\": "\\",
};

function findClosingQuote(text: string, start: number, quote: string): number {
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (quote === '"' && char === "\\") {
      i++;
      continue;
    }
    if (char === quote) return i;
  }
  return -1;
}

function unescapeDoubleQuoted(value: string): string {
  return value.replace(/\\([nrt"\\])/g, (_, char: string) => DOUBLE_QUOTE_ESCAPES[char] ?? char);
}

function countNewlines(text: string, start: number, end: number): number {
  let count = 0;
  for (let i = start; i < end; i++) {
    if (text[i] === "\n") count++;
  }
  return count;
}

/**
 * Parses dotenv files written for other tools: `export` prefixes, inline
 * comments, single/double/backtick quotes, multiline quoted values, and
 * `\n`, `\r`, `\t`, `\"`, `\\` escapes inside double quotes.
 */
export function parseDotenv(content: string): DotenvParseResult {
  const text = content.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const secrets: BulkImportSecret[] = [];
  const invalidLines: InvalidLine[] = [];

  let pos = 0;
  let line = 1;

  while (pos < text.length) {
    const newlineIndex = text.indexOf("\n", pos);
    const lineEnd = newlineIndex === -1 ? text.length : newlineIndex;
    const rawLine = text.slice(pos, lineEnd);
    const trimmed = rawLine.trimStart();

    const nextLine = () => {
      pos = lineEnd + 1;
      line++;
    };

    if (trimmed === "" || trimmed.startsWith("#")) {
      nextLine();
      continue;
    }

    const match = /^(?:export\s+)?([^\s=#]+)[ \t]*=[ \t]*/.exec(trimmed);
    if (!match?.[1]) {
      invalidLines.push({ line, message: "Expected KEY=value" });
      nextLine();
      continue;
    }

    const key = match[1];
    const valueStart = pos + (rawLine.length - trimmed.length) + match[0].length;
    const quote = text[valueStart];

    if (quote === '"' || quote === "'" || quote === "`") {
      const closeIndex = findClosingQuote(text, valueStart + 1, quote);
      if (closeIndex === -1) {
        invalidLines.push({ line, message: `Unterminated ${quote} quote for ${key}` });
        nextLine();
        continue;
      }

      const inner = text.slice(valueStart + 1, closeIndex);
      const value = quote === '"' ? unescapeDoubleQuoted(inner) : inner;
      secrets.push({ key, value, type: detectType(value) });

      const closeLineEnd = text.indexOf("\n", closeIndex);
      const endOfEntry = closeLineEnd === -1 ? text.length : closeLineEnd;
      line += countNewlines(text, pos, endOfEntry) + 1;
      pos = endOfEntry + 1;
      continue;
    }

    let value = text.slice(valueStart, lineEnd);
    const commentIndex = value.startsWith("#") ? 0 : value.search(/\s#/);
    if (commentIndex !== -1) {
      value = value.slice(0, commentIndex);
    }
    value = value.trim();

    secrets.push({ key, value, type: detectType(value) });
    nextLine();
  }

  return { secrets, invalidLines };
}
