export const INLINE_IGNORE_MARKER = "relic-guard-ignore";
export const IGNORE_FILE = ".relicguardignore";

interface IgnoreRule {
  negated: boolean;
  regex: RegExp;
}

function escapeRegex(char: string): string {
  return /[\\^$.*+?()[\]{}|/]/.test(char) ? `\\${char}` : char;
}

function globToRegexSource(glob: string): string {
  let source = "";
  let i = 0;

  while (i < glob.length) {
    const char = glob[i]!;

    if (char === "*") {
      if (glob[i + 1] === "*") {
        const atSegmentStart = i === 0 || glob[i - 1] === "/";
        const atSegmentEnd = i + 2 === glob.length || glob[i + 2] === "/";
        if (atSegmentStart && atSegmentEnd) {
          if (i + 2 === glob.length) {
            source += ".*";
            i += 2;
          } else {
            source += "(?:.*/)?";
            i += 3;
          }
          continue;
        }
      }
      source += "[^/]*";
      i += 1;
      continue;
    }

    if (char === "?") {
      source += "[^/]";
      i += 1;
      continue;
    }

    if (char === "[") {
      const close = glob.indexOf("]", i + 2);
      if (close !== -1) {
        let body = glob.slice(i + 1, close);
        if (body.startsWith("!")) body = `^${body.slice(1)}`;
        source += `[${body.replace(/\\/g, "\\\\")}]`;
        i = close + 1;
        continue;
      }
    }

    if (char === "\\" && i + 1 < glob.length) {
      source += escapeRegex(glob[i + 1]!);
      i += 2;
      continue;
    }

    source += escapeRegex(char);
    i += 1;
  }

  return source;
}

function parseRule(rawLine: string): IgnoreRule | null {
  let line = rawLine.replace(/(?<!\\)\s+$/, "");
  if (line === "" || line.startsWith("#")) return null;

  let negated = false;
  if (line.startsWith("!")) {
    negated = true;
    line = line.slice(1);
  } else if (line.startsWith("\\!") || line.startsWith("\\#")) {
    line = line.slice(1);
  }

  const directoryOnly = line.endsWith("/");
  if (directoryOnly) line = line.slice(0, -1);
  if (line === "") return null;

  const anchored = line.includes("/");
  if (line.startsWith("/")) line = line.slice(1);

  const prefix = anchored ? "^" : "^(?:.*/)?";
  const suffix = directoryOnly ? "/.*$" : "(?:/.*)?$";

  return { negated, regex: new RegExp(`${prefix}${globToRegexSource(line)}${suffix}`) };
}

/**
 * Matches repo-relative, forward-slash paths against gitignore-style patterns.
 * The last matching pattern wins, so `!pattern` re-includes earlier matches.
 */
export class IgnoreMatcher {
  private readonly rules: IgnoreRule[];

  constructor(patterns: readonly string[]) {
    this.rules = patterns.map(parseRule).filter((rule): rule is IgnoreRule => rule !== null);
  }

  static fromFile(content: string): IgnoreMatcher {
    return new IgnoreMatcher(content.split(/\r?\n/));
  }

  get isEmpty(): boolean {
    return this.rules.length === 0;
  }

  ignores(path: string): boolean {
    const normalized = path.replace(/\\/g, "/").replace(/^\.\//, "");
    let ignored = false;
    for (const rule of this.rules) {
      if (rule.negated === ignored && rule.regex.test(normalized)) {
        ignored = !rule.negated;
      }
    }
    return ignored;
  }
}

export function hasInlineIgnore(line: string): boolean {
  return line.includes(INLINE_IGNORE_MARKER);
}
