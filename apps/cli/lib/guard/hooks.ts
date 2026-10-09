import { chmod, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getGitConfig } from "./git";

export const GUARD_HOOK_COMMAND = "relic guard scan --staged";
const HOOK_MARKER = "# Installed by `relic guard install`.";
const CHAINED_HOOK = "pre-commit.pre-relic";
const LEFTHOOK_COMMAND_NAME = "relic-guard";

const LEFTHOOK_FILES = ["lefthook.yml", ".lefthook.yml", "lefthook.yaml", ".lefthook.yaml"];
const PRE_COMMIT_FILES = [".pre-commit-config.yaml", ".pre-commit-config.yml"];

export type HookManager = "lefthook" | "husky" | "pre-commit" | "hooks-path";

export interface HookManagerInfo {
  manager: HookManager;
  configPath: string;
}

async function exists(path: string): Promise<boolean> {
  return (await stat(path).catch(() => null)) !== null;
}

export async function detectHookManager(root: string): Promise<HookManagerInfo | null> {
  for (const file of LEFTHOOK_FILES) {
    if (await exists(join(root, file))) return { manager: "lefthook", configPath: file };
  }

  const hooksPath = await getGitConfig(root, "core.hooksPath");
  if ((await exists(join(root, ".husky"))) || hooksPath?.includes(".husky")) {
    return { manager: "husky", configPath: ".husky/pre-commit" };
  }

  for (const file of PRE_COMMIT_FILES) {
    if (await exists(join(root, file))) return { manager: "pre-commit", configPath: file };
  }

  if (hooksPath) return { manager: "hooks-path", configPath: join(hooksPath, "pre-commit") };

  return null;
}

export function hookSnippet(manager: HookManager): string {
  switch (manager) {
    case "lefthook":
      return [
        "pre-commit:",
        "  commands:",
        `    ${LEFTHOOK_COMMAND_NAME}:`,
        `      run: ${GUARD_HOOK_COMMAND}`,
      ].join("\n");
    case "pre-commit":
      return [
        "- repo: local",
        "  hooks:",
        "    - id: relic-guard",
        "      name: relic guard",
        `      entry: ${GUARD_HOOK_COMMAND}`,
        "      language: system",
        "      pass_filenames: false",
      ].join("\n");
    case "husky":
    case "hooks-path":
      return GUARD_HOOK_COMMAND;
  }
}

const HOOK_SCRIPT = `#!/bin/sh
${HOOK_MARKER} Remove with \`relic guard uninstall\`.
hook_dir=$(dirname "$0")
if [ -x "$hook_dir/${CHAINED_HOOK}" ]; then
  "$hook_dir/${CHAINED_HOOK}" "$@" || exit $?
fi
if ! command -v relic >/dev/null 2>&1; then
  echo "relic guard: relic is not on PATH, skipping leak scan" >&2
  exit 0
fi
exec ${GUARD_HOOK_COMMAND}
`;

export type InstallResult = "installed" | "chained" | "already-installed";
export type UninstallResult = "removed" | "restored" | "not-installed";

export async function installGitHook(hooksDir: string): Promise<InstallResult> {
  const hookPath = join(hooksDir, "pre-commit");
  const existing = await readFile(hookPath, "utf-8").catch(() => null);

  if (existing?.includes(HOOK_MARKER)) return "already-installed";

  let result: InstallResult = "installed";
  if (existing !== null) {
    if (await exists(join(hooksDir, CHAINED_HOOK))) {
      throw new Error(
        `${join(hooksDir, CHAINED_HOOK)} already exists. Move it away before installing.`,
      );
    }
    await rename(hookPath, join(hooksDir, CHAINED_HOOK));
    result = "chained";
  }

  await writeFile(hookPath, HOOK_SCRIPT);
  await chmod(hookPath, 0o755);
  return result;
}

export async function uninstallGitHook(hooksDir: string): Promise<UninstallResult> {
  const hookPath = join(hooksDir, "pre-commit");
  const existing = await readFile(hookPath, "utf-8").catch(() => null);
  if (!existing?.includes(HOOK_MARKER)) return "not-installed";

  const chainedPath = join(hooksDir, CHAINED_HOOK);
  if (await exists(chainedPath)) {
    await rename(chainedPath, hookPath);
    return "restored";
  }

  await rm(hookPath);
  return "removed";
}

function indentOf(line: string): number {
  return line.length - line.trimStart().length;
}

function isContent(line: string): boolean {
  const trimmed = line.trim();
  return trimmed !== "" && !trimmed.startsWith("#");
}

function blockEnd(lines: string[], start: number, indent: number): number {
  let end = start + 1;
  while (end < lines.length && (!isContent(lines[end]!) || indentOf(lines[end]!) > indent)) {
    end++;
  }
  return end;
}

export function lefthookHasGuard(content: string): boolean {
  return content.includes(GUARD_HOOK_COMMAND);
}

/**
 * Adds the guard command under `pre-commit.commands` in a lefthook config.
 * Returns null when the config uses a layout this text edit can't safely
 * handle (e.g. `jobs:` or flow-style mappings); callers should print the snippet.
 */
export function addGuardToLefthook(content: string): string | null {
  if (lefthookHasGuard(content)) return content;

  const lines = content.split("\n");
  const preCommit = lines.findIndex((line) => /^pre-commit:\s*(#.*)?$/.test(line));

  if (preCommit === -1) {
    if (/^pre-commit\s*:/m.test(content)) return null;
    const base = content.endsWith("\n") || content === "" ? content : `${content}\n`;
    const separator = base === "" ? "" : "\n";
    return `${base}${separator}${hookSnippet("lefthook")}\n`;
  }

  const end = blockEnd(lines, preCommit, 0);
  const block = lines.slice(preCommit + 1, end);
  const firstChild = block.find(isContent);
  const step = firstChild ? indentOf(firstChild) : 2;
  const pad = (depth: number) => " ".repeat(step * depth);

  const commandsOffset = block.findIndex(
    (line) => indentOf(line) === step && /^\s*commands:\s*(#.*)?$/.test(line),
  );

  if (commandsOffset === -1) {
    if (block.some((line) => indentOf(line) === step && /^\s*(jobs|scripts)\s*:/.test(line))) {
      return null;
    }
    lines.splice(
      preCommit + 1,
      0,
      `${pad(1)}commands:`,
      `${pad(2)}${LEFTHOOK_COMMAND_NAME}:`,
      `${pad(3)}run: ${GUARD_HOOK_COMMAND}`,
    );
    return lines.join("\n");
  }

  const commandsLine = preCommit + 1 + commandsOffset;
  const commandChild = lines
    .slice(commandsLine + 1, end)
    .find((line) => isContent(line) && indentOf(line) > step);
  const childIndent = commandChild ? indentOf(commandChild) : step * 2;
  const childStep = childIndent - step;

  lines.splice(
    commandsLine + 1,
    0,
    `${" ".repeat(childIndent)}${LEFTHOOK_COMMAND_NAME}:`,
    `${" ".repeat(childIndent + childStep)}run: ${GUARD_HOOK_COMMAND}`,
  );
  return lines.join("\n");
}

function removeBlock(lines: string[], index: number): void {
  const end = blockEnd(lines, index, indentOf(lines[index]!));
  lines.splice(index, end - index);
}

function hasChildren(lines: string[], index: number): boolean {
  const indent = indentOf(lines[index]!);
  for (let i = index + 1; i < lines.length; i++) {
    if (!isContent(lines[i]!)) continue;
    return indentOf(lines[i]!) > indent;
  }
  return false;
}

export function removeGuardFromLefthook(content: string): string {
  const lines = content.split("\n");
  const commandIndex = lines.findIndex((line) =>
    new RegExp(`^\\s+${LEFTHOOK_COMMAND_NAME}:\\s*$`).test(line),
  );
  if (commandIndex === -1) return content;

  removeBlock(lines, commandIndex);

  for (const pattern of [/^\s+commands:\s*$/, /^pre-commit:\s*$/]) {
    let parent = -1;
    for (let i = Math.min(commandIndex, lines.length) - 1; i >= 0; i--) {
      if (pattern.test(lines[i]!)) {
        parent = i;
        break;
      }
      if (isContent(lines[i]!) && indentOf(lines[i]!) === 0) break;
    }
    if (parent === -1 || hasChildren(lines, parent)) break;
    lines.splice(parent, 1);
  }

  return lines.join("\n").replace(/\n{3,}$/, "\n");
}
