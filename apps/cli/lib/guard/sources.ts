import { readdir, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { readBlobs, runGit, splitNul } from "./git";
import type { IgnoreMatcher } from "./ignore";

export const DEFAULT_MAX_FILE_BYTES = 5 * 1024 * 1024;
const BINARY_SNIFF_BYTES = 8000;
const READ_CONCURRENCY = 32;
const WALK_SKIP_DIRS = new Set([".git", "node_modules"]);

export type ScanMode = "paths" | "staged" | "range";

export interface ScanFile {
  path: string;
  commit?: string;
}

export interface ScanChunk {
  path: string;
  text: string;
  startLine: number;
  commit?: string;
}

export interface ScanTargets {
  mode: ScanMode;
  root: string;
  files: ScanFile[];
  chunks: ScanChunk[];
  skippedBinary: number;
  skippedLarge: number;
}

export interface CollectOptions {
  root: string;
  isGitRepo: boolean;
  ignore: IgnoreMatcher;
  maxFileBytes?: number;
}

function toPosix(path: string): string {
  return sep === "/" ? path : path.split(sep).join("/");
}

function isBinary(content: Uint8Array): boolean {
  const limit = Math.min(content.length, BINARY_SNIFF_BYTES);
  for (let i = 0; i < limit; i++) {
    if (content[i] === 0) return true;
  }
  return false;
}

const decoder = new TextDecoder("utf-8");

function emptyTargets(mode: ScanMode, root: string): ScanTargets {
  return { mode, root, files: [], chunks: [], skippedBinary: 0, skippedLarge: 0 };
}

async function walk(dir: string, root: string, out: string[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!WALK_SKIP_DIRS.has(entry.name)) await walk(full, root, out);
    } else if (entry.isFile()) {
      out.push(toPosix(relative(root, full)));
    }
  }
}

async function listPathModeFiles(
  paths: string[],
  cwd: string,
  options: CollectOptions,
): Promise<string[]> {
  const absolute = (paths.length > 0 ? paths : ["."]).map((p) =>
    isAbsolute(p) ? p : resolve(cwd, p),
  );
  const files = new Set<string>();

  if (options.isGitRepo) {
    const pathspecs = absolute.map((p) => toPosix(relative(options.root, p)) || ".");
    const { stdout } = await runGit(
      [
        "--literal-pathspecs",
        "ls-files",
        "-z",
        "--cached",
        "--others",
        "--exclude-standard",
        "--",
        ...pathspecs,
      ],
      { cwd: options.root },
    );
    for (const file of splitNul(stdout.toString("utf-8"))) files.add(file);
  }

  for (const target of absolute) {
    const info = await stat(target).catch(() => null);
    if (!info) continue;
    if (info.isFile()) {
      files.add(toPosix(relative(options.root, target)));
    } else if (info.isDirectory() && !options.isGitRepo) {
      const found: string[] = [];
      await walk(target, options.root, found);
      for (const file of found) files.add(file);
    }
  }

  return [...files].sort();
}

export async function collectPathTargets(
  paths: string[],
  cwd: string,
  options: CollectOptions,
): Promise<ScanTargets> {
  const targets = emptyTargets("paths", options.root);
  const maxBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  const files = (await listPathModeFiles(paths, cwd, options)).filter(
    (file) => !options.ignore.ignores(file),
  );

  for (let i = 0; i < files.length; i += READ_CONCURRENCY) {
    const batch = files.slice(i, i + READ_CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (path) => {
        const full = join(options.root, path);
        const info = await stat(full).catch(() => null);
        if (!info?.isFile()) return null;
        if (info.size > maxBytes) return { path, content: null };
        return { path, content: await Bun.file(full).bytes() };
      }),
    );

    for (const result of results) {
      if (!result) continue;
      targets.files.push({ path: result.path });
      if (result.content === null) {
        targets.skippedLarge++;
      } else if (isBinary(result.content)) {
        targets.skippedBinary++;
      } else {
        targets.chunks.push({
          path: result.path,
          text: decoder.decode(result.content),
          startLine: 1,
        });
      }
    }
  }

  return targets;
}

const SKIPPED_MODES = new Set(["160000", "120000"]);

export async function collectStagedTargets(options: CollectOptions): Promise<ScanTargets> {
  const targets = emptyTargets("staged", options.root);
  const maxBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;

  const { stdout } = await runGit(
    ["diff", "--cached", "--raw", "-z", "--no-abbrev", "--no-renames", "--diff-filter=ACMR"],
    { cwd: options.root },
  );

  const tokens = splitNul(stdout.toString("utf-8"));
  const entries: { path: string; sha: string }[] = [];
  for (let i = 0; i + 1 < tokens.length; i += 2) {
    const [, newMode, , sha] = tokens[i]!.slice(1).split(" ");
    const path = tokens[i + 1]!;
    if (!newMode || !sha || SKIPPED_MODES.has(newMode)) continue;
    if (options.ignore.ignores(path)) continue;
    entries.push({ path, sha });
  }

  const blobs = await readBlobs(
    options.root,
    entries.map((e) => e.sha),
    maxBytes,
  );

  for (const entry of entries) {
    targets.files.push({ path: entry.path });
    const blob = blobs.get(entry.sha);
    if (!blob?.content) {
      if (blob) targets.skippedLarge++;
      continue;
    }
    if (isBinary(blob.content)) {
      targets.skippedBinary++;
      continue;
    }
    targets.chunks.push({ path: entry.path, text: decoder.decode(blob.content), startLine: 1 });
  }

  return targets;
}

const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/**
 * Splits a `diff-tree -p -U0` patch into per-file added-line chunks. Contiguous
 * added lines are joined so multi-line values (PEM keys, JSON) still match.
 */
function parseAddedChunks(patch: string, paths: string[], commit: string): ScanChunk[] {
  const chunks: ScanChunk[] = [];
  const sections = patch.split(/^diff --git /m).slice(1);

  sections.forEach((section, index) => {
    const path = paths[index];
    if (!path) return;

    let inHunk = false;
    let nextLine = 0;
    let buffer: string[] = [];
    let bufferStart = 0;

    const flush = () => {
      if (buffer.length > 0) {
        chunks.push({ path, text: buffer.join("\n"), startLine: bufferStart, commit });
        buffer = [];
      }
    };

    for (const line of section.split("\n")) {
      const header = HUNK_HEADER.exec(line);
      if (header) {
        flush();
        inHunk = true;
        nextLine = Number(header[1]);
        continue;
      }
      if (!inHunk) continue;

      if (line.startsWith("+")) {
        if (buffer.length === 0) bufferStart = nextLine;
        buffer.push(line.slice(1));
        nextLine++;
      } else if (!line.startsWith("\\")) {
        flush();
        if (line.startsWith(" ")) nextLine++;
      }
    }
    flush();
  });

  return chunks;
}

export async function collectRangeTargets(
  range: string,
  options: CollectOptions,
): Promise<ScanTargets> {
  const targets = emptyTargets("range", options.root);

  const revListArgs = ["rev-list", "--no-merges", "--reverse"];
  if (range.includes("...")) revListArgs.push("--right-only");
  const commits = (await runGit([...revListArgs, range, "--"], { cwd: options.root })).stdout
    .toString("utf-8")
    .split("\n")
    .filter(Boolean);

  const diffArgs = ["-r", "--no-commit-id", "--root", "--no-renames", "--diff-filter=ACMR"];

  for (const commit of commits) {
    const names = splitNul(
      (
        await runGit(["diff-tree", ...diffArgs, "-z", "--name-only", commit], { cwd: options.root })
      ).stdout.toString("utf-8"),
    );
    if (names.length === 0) continue;

    const patch = (
      await runGit(["diff-tree", ...diffArgs, "-p", "-U0", "--no-color", "--no-ext-diff", commit], {
        cwd: options.root,
      })
    ).stdout.toString("utf-8");

    for (const path of names) {
      if (!options.ignore.ignores(path)) targets.files.push({ path, commit });
    }

    for (const chunk of parseAddedChunks(patch, names, commit)) {
      if (options.ignore.ignores(chunk.path)) continue;
      if (chunk.text.includes("\0")) {
        targets.skippedBinary++;
        continue;
      }
      targets.chunks.push(chunk);
    }
  }

  return targets;
}
