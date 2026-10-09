export type ScanLanguage = "js" | "python";

export interface EnvReference {
  name: string;
  start: number;
  end: number;
}

const JS_LANGUAGES = new Set([
  "javascript",
  "javascriptreact",
  "typescript",
  "typescriptreact",
  "vue",
  "svelte",
  "astro",
]);

export function scanLanguageFor(languageId: string): ScanLanguage | null {
  if (JS_LANGUAGES.has(languageId)) return "js";
  if (languageId === "python") return "python";
  return null;
}

const NAME = "[A-Za-z_][A-Za-z0-9_]*";

const JS_PATTERN = new RegExp(
  String.raw`(?<![\w$.])(?:process\.env|import\.meta\.env|Bun\.env)(?:\??\.(${NAME})(?![\w$])|\??\.?\[\s*(["'\x60])(${NAME})\2\s*\])`,
  "g",
);

const PYTHON_PATTERN = new RegExp(
  String.raw`(?<![\w.])(?:os\.)?(?:environ\[\s*(["'])(${NAME})\1\s*\]|(?:getenv|environ\.get)\(\s*(["'])(${NAME})\3)`,
  "g",
);

/**
 * Replaces comments with spaces so offsets stay aligned. Strings are kept
 * because `process.env.X` inside a template literal is still a real read.
 */
export function maskComments(text: string, language: ScanLanguage): string {
  const out = text.split("");
  let i = 0;
  let quote: string | null = null;

  const blank = (from: number, to: number) => {
    for (let k = from; k < to; k++) {
      if (out[k] !== "\n") out[k] = " ";
    }
  };

  while (i < text.length) {
    const ch = text[i]!;

    if (quote) {
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (text.startsWith(quote, i) || (ch === "\n" && quote.length === 1 && quote !== "`")) {
        i += ch === "\n" ? 1 : quote.length;
        quote = null;
        continue;
      }
      i++;
      continue;
    }

    if (language === "python") {
      if (ch === "#") {
        const end = text.indexOf("\n", i);
        const stop = end === -1 ? text.length : end;
        blank(i, stop);
        i = stop;
        continue;
      }
      if (text.startsWith('"""', i) || text.startsWith("'''", i)) {
        quote = text.slice(i, i + 3);
        i += 3;
        continue;
      }
    } else {
      if (text.startsWith("//", i)) {
        const end = text.indexOf("\n", i);
        const stop = end === -1 ? text.length : end;
        blank(i, stop);
        i = stop;
        continue;
      }
      if (text.startsWith("/*", i)) {
        const end = text.indexOf("*/", i + 2);
        const stop = end === -1 ? text.length : end + 2;
        blank(i, stop);
        i = stop;
        continue;
      }
      if (ch === "`") {
        quote = "`";
        i++;
        continue;
      }
    }

    if (ch === '"' || ch === "'") {
      quote = ch;
      i++;
      continue;
    }
    i++;
  }

  return out.join("");
}

export function findEnvReferences(text: string, language: ScanLanguage): EnvReference[] {
  const source = maskComments(text, language);
  const pattern = language === "js" ? JS_PATTERN : PYTHON_PATTERN;
  const references: EnvReference[] = [];

  pattern.lastIndex = 0;
  for (const match of source.matchAll(pattern)) {
    const name = language === "js" ? (match[1] ?? match[3]) : (match[2] ?? match[4]);
    if (!name) continue;
    const start = match.index + match[0].lastIndexOf(name);
    references.push({ name, start, end: start + name.length });
  }

  return references;
}
