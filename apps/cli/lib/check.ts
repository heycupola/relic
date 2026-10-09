import { readFile, stat } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import pc from "picocolors";
import {
  DEFAULT_ENV_TEMPLATES,
  type KeyLocation,
  listScanFiles,
  parseEnvKeys,
  type RequiredKeys,
  scanFiles,
} from "./env-keys";
import type { SecretScope } from "./types";

export interface RequiredKeySource {
  type: "file" | "scan";
  path: string;
  keys: number;
  filesScanned?: number;
}

export interface CollectedKeys {
  keys: RequiredKeys;
  sources: RequiredKeySource[];
}

export interface MissingKey {
  key: string;
  locations: string[];
}

export interface CheckReport {
  ok: boolean;
  strict: boolean;
  environment: string;
  folder: string | null;
  scope: SecretScope | null;
  sources: RequiredKeySource[];
  ignored: string[];
  required: {
    total: number;
    present: number;
    missing: MissingKey[];
    unused: string[];
  } | null;
  compare: {
    base: string;
    other: string;
    onlyInBase: string[];
    onlyInOther: string[];
  } | null;
}

export function readCheckIgnore(config: unknown): string[] {
  if (typeof config !== "object" || config === null || !("check" in config)) return [];

  const check = (config as { check?: unknown }).check;
  if (typeof check !== "object" || check === null || !("ignore" in check)) return [];

  const ignore = (check as { ignore?: unknown }).ignore;
  if (!Array.isArray(ignore) || !ignore.every((item) => typeof item === "string")) {
    throw new Error("relic.toml: [check] ignore must be an array of strings");
  }
  return ignore;
}

function toDisplayPath(path: string, cwd: string): string {
  const rel = relative(cwd, path);
  return (rel.startsWith("..") ? path : rel).split(sep).join("/");
}

function addKeys(target: RequiredKeys, keys: Iterable<[string, KeyLocation[]]>) {
  for (const [key, locations] of keys) {
    target.set(key, [...(target.get(key) ?? []), ...locations]);
  }
}

export async function collectRequiredKeys(options: {
  rootDir: string;
  from?: string[];
  scan?: string[];
  cwd?: string;
}): Promise<CollectedKeys> {
  const cwd = options.cwd ?? process.cwd();
  const keys: RequiredKeys = new Map();
  const sources: RequiredKeySource[] = [];

  const templateFiles: string[] = [];
  if (options.from && options.from.length > 0) {
    for (const file of options.from) {
      const absolute = resolve(cwd, file);
      if (!(await stat(absolute).catch(() => null))?.isFile()) {
        throw new Error(`Required keys file not found: ${file}`);
      }
      templateFiles.push(absolute);
    }
  } else {
    for (const name of DEFAULT_ENV_TEMPLATES) {
      const absolute = join(options.rootDir, name);
      if ((await stat(absolute).catch(() => null))?.isFile()) templateFiles.push(absolute);
    }
  }

  for (const file of templateFiles) {
    const display = toDisplayPath(file, cwd);
    const fileKeys = parseEnvKeys(await readFile(file, "utf-8"));
    addKeys(
      keys,
      fileKeys.map((key) => [key, [{ file: display }]]),
    );
    sources.push({ type: "file", path: display, keys: fileKeys.length });
  }

  if (options.scan) {
    const scanPaths = options.scan.length > 0 ? options.scan : [options.rootDir];
    const files = await listScanFiles(scanPaths.map((path) => resolve(cwd, path)));
    const scanned = await scanFiles(files, cwd);
    addKeys(keys, scanned.keys);
    sources.push({
      type: "scan",
      path: scanPaths.map((path) => toDisplayPath(resolve(cwd, path), cwd) || ".").join(", "),
      keys: scanned.keys.size,
      filesScanned: scanned.filesScanned,
    });
  }

  return { keys, sources };
}

function formatLocation(location: KeyLocation): string {
  return location.line ? `${location.file}:${location.line}` : location.file;
}

export function buildCheckReport(input: {
  environment: string;
  folder?: string;
  scope?: SecretScope;
  strict?: boolean;
  required: CollectedKeys | null;
  available: string[];
  compare: { environment: string; available: string[] } | null;
  isIgnored: (key: string) => boolean;
}): CheckReport {
  const ignored = new Set<string>();
  const keep = (key: string) => {
    if (!input.isIgnored(key)) return true;
    ignored.add(key);
    return false;
  };

  const available = new Set(input.available.filter(keep));
  const strict = input.strict ?? false;

  let required: CheckReport["required"] = null;
  if (input.required) {
    const requiredKeys = [...input.required.keys.keys()].filter(keep).sort();
    const requiredSet = new Set(requiredKeys);
    const missing = requiredKeys
      .filter((key) => !available.has(key))
      .map((key) => ({
        key,
        locations: [...new Set(input.required!.keys.get(key)!.map(formatLocation))],
      }));

    required = {
      total: requiredKeys.length,
      present: requiredKeys.length - missing.length,
      missing,
      unused: [...available].filter((key) => !requiredSet.has(key)).sort(),
    };
  }

  let compare: CheckReport["compare"] = null;
  if (input.compare) {
    const other = new Set(input.compare.available.filter(keep));
    compare = {
      base: input.environment,
      other: input.compare.environment,
      onlyInBase: [...available].filter((key) => !other.has(key)).sort(),
      onlyInOther: [...other].filter((key) => !available.has(key)).sort(),
    };
  }

  const hasMissing = (required?.missing.length ?? 0) > 0;
  const hasUnused = (required?.unused.length ?? 0) > 0;
  const hasDrift = (compare?.onlyInBase.length ?? 0) + (compare?.onlyInOther.length ?? 0) > 0;

  return {
    ok: !hasMissing && !(strict && (hasUnused || hasDrift)),
    strict,
    environment: input.environment,
    folder: input.folder ?? null,
    scope: input.scope ?? null,
    sources: input.required?.sources ?? [],
    ignored: [...ignored].sort(),
    required,
    compare,
  };
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function formatKeyList(keys: string[], indent = "    "): string[] {
  return keys.map((key) => `${indent}${key}`);
}

export function formatCheckReport(report: CheckReport): string {
  const lines: string[] = [];
  const location = [
    report.environment,
    report.folder ? `/${report.folder}` : "",
    report.scope ? ` (${report.scope})` : "",
  ].join("");

  lines.push("");
  lines.push(`  ${pc.bold("relic check")} ${pc.cyan(location)}`);

  if (report.sources.length > 0) {
    const sourceText = report.sources
      .map((source) =>
        source.type === "scan"
          ? `scan of ${source.path} (${plural(source.filesScanned ?? 0, "file")})`
          : source.path,
      )
      .join(", ");
    lines.push(`  ${pc.dim(`Required keys from ${sourceText}`)}`);
  }
  if (report.ignored.length > 0) {
    lines.push(`  ${pc.dim(`Ignoring ${report.ignored.join(", ")}`)}`);
  }
  lines.push("");

  const required = report.required;
  if (required) {
    if (required.missing.length > 0) {
      lines.push(`  ${pc.red(pc.bold(`Missing (${required.missing.length})`))}`);
      const width = Math.max(...required.missing.map((m) => m.key.length)) + 2;
      for (const missing of required.missing) {
        lines.push(
          `    ${pc.red(missing.key.padEnd(width))}${pc.dim(missing.locations.join(", "))}`,
        );
      }
      lines.push("");
    }

    if (required.unused.length > 0) {
      const label = `Unused (${required.unused.length})`;
      lines.push(`  ${report.strict ? pc.red(pc.bold(label)) : pc.yellow(label)}`);
      lines.push(...formatKeyList(required.unused).map((line) => pc.dim(line)));
      lines.push("");
    }
  }

  const compare = report.compare;
  if (compare) {
    const drift = compare.onlyInBase.length + compare.onlyInOther.length;
    lines.push(`  ${pc.bold(`${compare.base} vs ${compare.other}`)}`);
    if (drift === 0) {
      lines.push(`    ${pc.green("Same key names")}`);
    } else {
      for (const [env, keys] of [
        [compare.base, compare.onlyInBase],
        [compare.other, compare.onlyInOther],
      ] as const) {
        if (keys.length === 0) continue;
        lines.push(`    ${pc.yellow(`Only in ${env} (${keys.length})`)}`);
        lines.push(...formatKeyList(keys, "      "));
      }
    }
    lines.push("");
  }

  const summary: string[] = [];
  if (required) {
    summary.push(`${required.present}/${required.total} required keys present`);
    if (required.missing.length > 0) summary.push(`${required.missing.length} missing`);
    if (required.unused.length > 0) summary.push(`${required.unused.length} unused`);
  }
  if (compare) {
    const drift = compare.onlyInBase.length + compare.onlyInOther.length;
    summary.push(
      drift === 0 ? `in sync with ${compare.other}` : `${drift} differ from ${compare.other}`,
    );
  }

  const mark = report.ok ? pc.green("✓") : pc.red("✗");
  lines.push(`  ${mark} ${summary.join(", ")}`);
  lines.push("");

  return lines.join("\n");
}
