import type { Dirent } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";

export const DEFAULT_ENV_TEMPLATES = [".env.example", ".env.sample", ".env.template"];

const KEY = "[A-Za-z_][A-Za-z0-9_]*";
const ENV_LINE = new RegExp(`^\\s*(?:export\\s+)?(${KEY})\\s*(=|$)`);

const SCANNABLE_EXTENSIONS = new Set([
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".vue",
  ".svelte",
  ".astro",
  ".py",
]);

const SKIPPED_DIRS = new Set([
  ".git",
  ".relic",
  ".next",
  ".nuxt",
  ".output",
  ".svelte-kit",
  ".turbo",
  ".vercel",
  ".cache",
  ".venv",
  "venv",
  "__pycache__",
  "node_modules",
  "bower_components",
  "vendor",
  "dist",
  "build",
  "out",
  "coverage",
  "target",
]);

const MAX_SCAN_FILE_BYTES = 1024 * 1024;

const VITE_BUILTINS = new Set(["MODE", "BASE_URL", "PROD", "DEV", "SSR"]);

const JS_ENV_OBJECT = String.raw`(?:process\.env|import\.meta\.env|Bun\.env)`;

const SCAN_PATTERNS: Array<{ regex: RegExp; group: number; viteObjectGroup?: number }> = [
  {
    regex: new RegExp(String.raw`\b(process\.env|import\.meta\.env|Bun\.env)\??\.(${KEY})`, "g"),
    group: 2,
    viteObjectGroup: 1,
  },
  {
    regex: new RegExp(
      String.raw`\b(process\.env|import\.meta\.env|Bun\.env)\??\.?\[\s*(["'\x60])(${KEY})\2\s*\]`,
      "g",
    ),
    group: 3,
    viteObjectGroup: 1,
  },
  {
    regex: new RegExp(String.raw`\bos\.environ\[\s*(["'])(${KEY})\1\s*\]`, "g"),
    group: 2,
  },
  {
    regex: new RegExp(String.raw`\bos\.(?:getenv|environ\.get)\(\s*(["'])(${KEY})\1`, "g"),
    group: 2,
  },
];

const DESTRUCTURE_PATTERN = new RegExp(
  String.raw`\{([^{}]*)\}\s*=\s*(${JS_ENV_OBJECT})(?![\w.$\[])`,
  "g",
);

export interface KeyLocation {
  file: string;
  line?: number;
}

export type RequiredKeys = Map<string, KeyLocation[]>;

export function parseEnvKeys(content: string): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  let openQuote: string | null = null;

  for (const line of content.split(/\r?\n/)) {
    if (openQuote) {
      if (line.includes(openQuote)) openQuote = null;
      continue;
    }

    const match = ENV_LINE.exec(line);
    if (!match) continue;

    const key = match[1]!;
    if (!seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }

    if (match[2] === "=") {
      const value = line.slice(match[0].length).trimStart();
      const quote = value[0];
      if ((quote === '"' || quote === "'" || quote === "`") && !value.slice(1).includes(quote)) {
        openQuote = quote;
      }
    }
  }

  return keys;
}

function lineAt(content: string, index: number): number {
  let line = 1;
  for (let i = content.indexOf("\n"); i !== -1 && i < index; i = content.indexOf("\n", i + 1)) {
    line++;
  }
  return line;
}

export function scanEnvReads(content: string): Array<{ key: string; line: number }> {
  const found = new Map<string, number>();

  const record = (key: string, index: number) => {
    if (!found.has(key)) found.set(key, lineAt(content, index));
  };

  for (const { regex, group, viteObjectGroup } of SCAN_PATTERNS) {
    for (const match of content.matchAll(regex)) {
      const key = match[group]!;
      if (
        viteObjectGroup !== undefined &&
        match[viteObjectGroup] === "import.meta.env" &&
        VITE_BUILTINS.has(key)
      ) {
        continue;
      }
      record(key, match.index);
    }
  }

  for (const match of content.matchAll(DESTRUCTURE_PATTERN)) {
    for (const part of match[1]!.split(",")) {
      const name = part.split(/[:=]/)[0]!.trim();
      if (name.startsWith("...") || !new RegExp(`^${KEY}$`).test(name)) continue;
      if (match[2] === "import.meta.env" && VITE_BUILTINS.has(name)) continue;
      record(name, match.index);
    }
  }

  return [...found].map(([key, line]) => ({ key, line }));
}

function extensionOf(path: string): string {
  const dot = path.lastIndexOf(".");
  return dot === -1 ? "" : path.slice(dot);
}

function isScannable(relativePath: string): boolean {
  if (!SCANNABLE_EXTENSIONS.has(extensionOf(relativePath))) return false;
  if (relativePath.endsWith(".min.js")) return false;
  return !relativePath.split(/[\\/]/).some((segment) => SKIPPED_DIRS.has(segment));
}

function listGitFiles(dir: string): string[] | null {
  try {
    const result = Bun.spawnSync(
      ["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard"],
      { cwd: dir, stdout: "pipe", stderr: "ignore" },
    );
    if (result.exitCode !== 0) return null;
    return result.stdout.toString().split("\0").filter(Boolean);
  } catch {
    return null;
  }
}

export function parseGitignore(content: string): (relativePath: string) => boolean {
  const globs: Bun.Glob[] = [];

  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("!")) continue;

    const anchored = line.startsWith("/") || line.slice(0, -1).includes("/");
    const pattern = line.replace(/^\//, "").replace(/\/$/, "");
    const base = anchored ? pattern : `**/${pattern}`;
    globs.push(new Bun.Glob(base), new Bun.Glob(`${base}/**`));
  }

  return (relativePath) => globs.some((glob) => glob.match(relativePath));
}

async function walkFiles(root: string): Promise<string[]> {
  let ignored: (path: string) => boolean = () => false;
  try {
    ignored = parseGitignore(await readFile(join(root, ".gitignore"), "utf-8"));
  } catch {
    // no .gitignore
  }

  const files: string[] = [];
  const pending = [root];

  while (pending.length > 0) {
    const dir = pending.pop()!;
    let entries: Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const relativePath = relative(root, fullPath).split(sep).join("/");
      if (ignored(relativePath)) continue;

      if (entry.isDirectory()) {
        if (!SKIPPED_DIRS.has(entry.name)) pending.push(fullPath);
      } else if (entry.isFile()) {
        files.push(relativePath);
      }
    }
  }

  return files;
}

export async function listScanFiles(paths: string[]): Promise<string[]> {
  const files = new Set<string>();

  for (const path of paths) {
    const absolute = resolve(path);
    const info = await stat(absolute).catch(() => null);
    if (!info) {
      throw new Error(`Scan path not found: ${path}`);
    }

    if (info.isFile()) {
      if (SCANNABLE_EXTENSIONS.has(extensionOf(absolute))) files.add(absolute);
      continue;
    }

    const relativeFiles = listGitFiles(absolute) ?? (await walkFiles(absolute));
    for (const file of relativeFiles) {
      if (isScannable(file)) files.add(join(absolute, file));
    }
  }

  return [...files].sort();
}

export async function scanFiles(
  files: string[],
  displayRoot: string,
): Promise<{ keys: RequiredKeys; filesScanned: number }> {
  const keys: RequiredKeys = new Map();
  let filesScanned = 0;

  for (const file of files) {
    const info = await stat(file).catch(() => null);
    if (!info?.isFile() || info.size > MAX_SCAN_FILE_BYTES) continue;

    let content: string;
    try {
      content = await readFile(file, "utf-8");
    } catch {
      continue;
    }
    filesScanned++;

    const display = relative(displayRoot, file).split(sep).join("/");
    for (const { key, line } of scanEnvReads(content)) {
      const locations = keys.get(key) ?? [];
      locations.push({ file: display, line });
      keys.set(key, locations);
    }
  }

  return { keys, filesScanned };
}

export function compileIgnore(patterns: string[]): (key: string) => boolean {
  const exact = new Set<string>();
  const wildcards: RegExp[] = [];

  for (const pattern of patterns) {
    const trimmed = pattern.trim();
    if (!trimmed) continue;
    if (trimmed.includes("*")) {
      const escaped = trimmed.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
      wildcards.push(new RegExp(`^${escaped}$`));
    } else {
      exact.add(trimmed);
    }
  }

  return (key) => exact.has(key) || wildcards.some((regex) => regex.test(key));
}
