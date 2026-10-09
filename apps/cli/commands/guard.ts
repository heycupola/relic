import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as p from "@clack/prompts";
import { trackEvent } from "@repo/logger";
import pc from "picocolors";
import { getErrorMessage } from "../lib/cli";
import { type ConfigResult, findConfig } from "../lib/config";
import { DotenvDetector } from "../lib/guard/dotenv";
import { findRepoRoot, getHooksDir } from "../lib/guard/git";
import {
  addGuardToLefthook,
  detectHookManager,
  GUARD_HOOK_COMMAND,
  hookSnippet,
  installGitHook,
  lefthookHasGuard,
  removeGuardFromLefthook,
  uninstallGitHook,
} from "../lib/guard/hooks";
import { IGNORE_FILE, IgnoreMatcher, INLINE_IGNORE_MARKER } from "../lib/guard/ignore";
import { DEFAULT_MIN_LENGTH } from "../lib/guard/patterns";
import { type Finding, scanTargets } from "../lib/guard/scan";
import {
  collectPathTargets,
  collectRangeTargets,
  collectStagedTargets,
  type ScanMode,
  type ScanTargets,
} from "../lib/guard/sources";
import { loadSecretValues, type ValuesDeps, type ValuesResult } from "../lib/guard/values";
import { exitWithTelemetry } from "../lib/telemetry";

export interface GuardScanOptions {
  staged?: boolean;
  range?: string;
  environment?: string[];
  project?: string;
  json?: boolean;
  requireValues?: boolean;
  values?: boolean;
  minLength?: string;
}

export interface GuardReport {
  mode: ScanMode;
  root: string;
  scanned: { files: number; skippedBinary: number; skippedLarge: number };
  values:
    | { status: "loaded"; environments: string[]; patterns: number; warnings: string[] }
    | { status: "skipped"; reason: string }
    | { status: "disabled" };
  findings: Finding[];
}

export const EXIT_CLEAN = 0;
export const EXIT_FINDINGS = 1;
export const EXIT_ERROR = 2;

export class GuardUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GuardUsageError";
  }
}

function parseMinLength(raw: string | number | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new GuardUsageError(`min length must be a positive integer, got "${raw}"`);
  }
  return value;
}

async function readIgnoreFile(root: string): Promise<IgnoreMatcher> {
  const content = await readFile(join(root, IGNORE_FILE), "utf-8").catch(() => "");
  return IgnoreMatcher.fromFile(content);
}

function summarizeValues(result: ValuesResult): GuardReport["values"] {
  if (result.status !== "loaded") return result;
  return {
    status: "loaded",
    environments: result.environments,
    patterns: result.patterns.values.length,
    warnings: result.warnings,
  };
}

export interface GuardScanDeps {
  cwd?: string;
  findConfig?: (dir: string) => Promise<ConfigResult | null>;
  valuesDeps?: ValuesDeps;
}

export async function runGuardScan(
  paths: string[],
  options: GuardScanOptions,
  deps: GuardScanDeps = {},
): Promise<{ report: GuardReport; exitCode: number }> {
  const cwd = deps.cwd ?? process.cwd();
  if (options.staged && options.range) {
    throw new GuardUsageError("--staged and --range cannot be used together");
  }
  if ((options.staged || options.range) && paths.length > 0) {
    throw new GuardUsageError("paths cannot be combined with --staged or --range");
  }

  const configResult = await (deps.findConfig ?? findConfig)(cwd);
  const guardConfig = configResult?.config.guard ?? {};
  const minLength =
    parseMinLength(options.minLength) ??
    parseMinLength(guardConfig.min_length) ??
    DEFAULT_MIN_LENGTH;

  const repoRoot = await findRepoRoot(cwd);
  if (!repoRoot && (options.staged || options.range)) {
    throw new GuardUsageError("--staged and --range require a git repository");
  }
  const root = repoRoot ?? configResult?.rootDir ?? cwd;
  const mode: ScanMode = options.staged ? "staged" : options.range ? "range" : "paths";

  const collectOptions = { root, isGitRepo: repoRoot !== null, ignore: await readIgnoreFile(root) };
  const collect = (): Promise<ScanTargets> => {
    if (options.staged) return collectStagedTargets(collectOptions);
    if (options.range) return collectRangeTargets(options.range, collectOptions);
    return collectPathTargets(paths, cwd, collectOptions);
  };

  const projectId =
    options.project ?? process.env.RELIC_PROJECT_ID ?? configResult?.config.project_id ?? null;
  const loadValues = (): Promise<ValuesResult> =>
    options.values === false
      ? Promise.resolve({ status: "disabled" })
      : loadSecretValues(
          { projectId, environments: options.environment ?? [], minLength },
          deps.valuesDeps,
        );

  const [targets, values] = await Promise.all([collect(), loadValues()]);

  const findings = scanTargets(
    targets,
    new DotenvDetector(guardConfig.allow ?? []),
    values.status === "loaded" ? values.patterns : null,
  );

  const report: GuardReport = {
    mode,
    root,
    scanned: {
      files: targets.files.length,
      skippedBinary: targets.skippedBinary,
      skippedLarge: targets.skippedLarge,
    },
    values: summarizeValues(values),
    findings,
  };

  let exitCode = findings.length > 0 ? EXIT_FINDINGS : EXIT_CLEAN;
  if (exitCode === EXIT_CLEAN && options.requireValues && values.status !== "loaded") {
    exitCode = EXIT_ERROR;
  }

  return { report, exitCode };
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function modeLabel(mode: ScanMode): string {
  if (mode === "staged") return "staged";
  if (mode === "range") return "commit range";
  return "working tree";
}

function formatLocation(finding: Finding): string {
  const commit = finding.commit ? `${pc.yellow(finding.commit.slice(0, 7))} ` : "";
  if (finding.type === "dotenv") return `${commit}${pc.white(finding.file)}`;
  return `${commit}${pc.white(`${finding.file}:${finding.line}:${finding.column}`)}`;
}

export function formatReport(report: GuardReport, requireValues = false): string {
  const lines: string[] = [""];
  const scope = `${plural(report.scanned.files, "file")} (${modeLabel(report.mode)})`;

  if (report.findings.length === 0) {
    lines.push(`  ${pc.green("✓")} ${pc.bold("relic guard")}  No leaks found in ${scope}`);
  } else {
    lines.push(
      `  ${pc.red("✗")} ${pc.bold("relic guard")}  ${plural(report.findings.length, "finding")} in ${scope}`,
    );
  }
  lines.push("");

  for (const finding of report.findings) {
    lines.push(`  ${formatLocation(finding)}`);
    if (finding.type === "dotenv") {
      lines.push(`    ${pc.red("dotenv file")}  ${pc.dim("should not be committed")}`);
    } else {
      const keys = finding.secrets
        .map((s) => `${pc.cyan(s.key)} ${pc.dim(`(${s.environment})`)}`)
        .join(", ");
      lines.push(`    ${keys}  ${pc.dim(finding.preview)}`);
    }
    lines.push("");
  }

  const values = report.values;
  if (values.status === "loaded") {
    const envs = values.environments.length > 0 ? values.environments.join(", ") : "none";
    lines.push(`  ${pc.dim(`Matched ${plural(values.patterns, "secret value")} from: ${envs}`)}`);
    for (const warning of values.warnings) {
      lines.push(`  ${pc.yellow("!")} ${pc.yellow(warning)}`);
    }
  } else if (values.status === "skipped") {
    const color = requireValues ? pc.red : pc.yellow;
    lines.push(`  ${color("!")} ${color(`Value matching skipped: ${values.reason}`)}`);
    if (requireValues) {
      lines.push(`    ${pc.dim("--require-values is set, so this scan fails.")}`);
    } else {
      lines.push(`    ${pc.dim("Only dotenv files were checked.")}`);
    }
  } else {
    lines.push(`  ${pc.dim("Value matching disabled (--no-values).")}`);
  }

  const skipped = report.scanned.skippedBinary + report.scanned.skippedLarge;
  if (skipped > 0) {
    lines.push(`  ${pc.dim(`Skipped ${plural(skipped, "binary or oversized file")}.`)}`);
  }

  if (report.findings.length > 0) {
    lines.push("");
    lines.push(
      `  ${pc.dim(`Silence a line with a \`${INLINE_IGNORE_MARKER}\` comment, or list paths in ${IGNORE_FILE}.`)}`,
    );
    if (report.findings.some((f) => f.type === "dotenv")) {
      lines.push(`  ${pc.dim("Allow dotenv files with `[guard] allow = [...]` in relic.toml.")}`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

export async function guardScan(paths: string[], options: GuardScanOptions): Promise<void> {
  try {
    const { report, exitCode } = await runGuardScan(paths, options);

    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(formatReport(report, options.requireValues));
    }

    trackEvent("cli_command_executed", {
      command: "guard_scan",
      mode: report.mode,
      finding_count: report.findings.length,
      values_status: report.values.status,
    });

    return exitWithTelemetry(exitCode);
  } catch (err) {
    const message = getErrorMessage(err);

    if (options.json) {
      console.log(JSON.stringify({ error: message }, null, 2));
    } else {
      console.error(`\n  ${pc.red(pc.bold("relic guard:"))} ${message}\n`);
    }
    return exitWithTelemetry(EXIT_ERROR);
  }
}

async function requireRepoRoot(): Promise<string> {
  const root = await findRepoRoot(process.cwd());
  if (!root) {
    console.error(`\n  ${pc.red(pc.bold("relic guard:"))} not a git repository\n`);
    return exitWithTelemetry(EXIT_ERROR);
  }
  return root;
}

function printSnippet(snippet: string): void {
  console.log();
  for (const line of snippet.split("\n")) {
    console.log(`    ${pc.cyan(line)}`);
  }
  console.log();
}

async function confirmEdit(message: string, yes: boolean | undefined): Promise<boolean> {
  if (yes) return true;
  if (!process.stdin.isTTY) return false;
  const answer = await p.confirm({ message, initialValue: false });
  return !p.isCancel(answer) && answer === true;
}

export async function guardInstall(options: { yes?: boolean }): Promise<void> {
  const root = await requireRepoRoot();
  const manager = await detectHookManager(root);

  if (manager?.manager === "lefthook") {
    const configPath = join(root, manager.configPath);
    const content = await readFile(configPath, "utf-8");

    if (lefthookHasGuard(content)) {
      console.log(pc.green(`\n  ✓ ${manager.configPath} already runs relic guard\n`));
      return;
    }

    console.log(`\n  Lefthook detected. Add this to ${pc.white(manager.configPath)}:`);
    printSnippet(hookSnippet("lefthook"));

    if (!(await confirmEdit(`Add relic guard to ${manager.configPath} now?`, options.yes))) {
      console.log(pc.dim(`  Re-run with --yes to edit ${manager.configPath} automatically.\n`));
      return;
    }

    const updated = addGuardToLefthook(content);
    if (updated === null) {
      console.log(
        pc.yellow(
          `  ! Couldn't edit ${manager.configPath} safely. Add the snippet above by hand.\n`,
        ),
      );
      return exitWithTelemetry(EXIT_ERROR);
    }

    await writeFile(configPath, updated);
    trackEvent("cli_command_executed", { command: "guard_install", manager: "lefthook" });
    console.log(pc.green(`  ✓ Updated ${manager.configPath}`));
    console.log(pc.dim("    Run `lefthook install` if your hooks aren't installed yet.\n"));
    return;
  }

  if (manager) {
    const where =
      manager.manager === "husky"
        ? `Husky detected. Add this line to ${pc.white(manager.configPath)}:`
        : manager.manager === "pre-commit"
          ? `pre-commit detected. Add this under \`repos:\` in ${pc.white(manager.configPath)}:`
          : `core.hooksPath is set. Add this line to ${pc.white(manager.configPath)}:`;
    console.log(`\n  ${where}`);
    printSnippet(hookSnippet(manager.manager));
    return;
  }

  const hooksDir = await getHooksDir(root);
  const result = await installGitHook(hooksDir);
  trackEvent("cli_command_executed", { command: "guard_install", manager: "git" });

  if (result === "already-installed") {
    console.log(pc.green("\n  ✓ relic guard pre-commit hook is already installed\n"));
  } else if (result === "chained") {
    console.log(pc.green("\n  ✓ Installed relic guard pre-commit hook"));
    console.log(
      pc.dim("    Your existing hook was moved to pre-commit.pre-relic and still runs first.\n"),
    );
  } else {
    console.log(pc.green("\n  ✓ Installed relic guard pre-commit hook"));
    console.log(pc.dim(`    Each commit now runs \`${GUARD_HOOK_COMMAND}\`.\n`));
  }
}

export async function guardUninstall(options: { yes?: boolean }): Promise<void> {
  const root = await requireRepoRoot();
  const manager = await detectHookManager(root);

  if (manager?.manager === "lefthook") {
    const configPath = join(root, manager.configPath);
    const content = await readFile(configPath, "utf-8");
    const updated = removeGuardFromLefthook(content);

    if (updated !== content) {
      if (await confirmEdit(`Remove relic guard from ${manager.configPath}?`, options.yes)) {
        await writeFile(configPath, updated);
        console.log(pc.green(`\n  ✓ Removed relic guard from ${manager.configPath}\n`));
      } else {
        console.log(
          `\n  Remove the ${pc.cyan("relic-guard")} command from ${pc.white(manager.configPath)}, or re-run with --yes.\n`,
        );
      }
      return;
    }

    if (lefthookHasGuard(content)) {
      console.log(
        `\n  Remove the \`${GUARD_HOOK_COMMAND}\` command from ${pc.white(manager.configPath)}.\n`,
      );
      return;
    }
  } else if (manager) {
    console.log(
      `\n  Remove \`${GUARD_HOOK_COMMAND}\` from ${pc.white(manager.configPath)} to disable relic guard.\n`,
    );
    return;
  }

  const result = await uninstallGitHook(await getHooksDir(root));
  if (result === "not-installed") {
    console.log(pc.dim("\n  relic guard pre-commit hook is not installed\n"));
  } else if (result === "restored") {
    console.log(pc.green("\n  ✓ Removed relic guard and restored your previous pre-commit hook\n"));
  } else {
    console.log(pc.green("\n  ✓ Removed relic guard pre-commit hook\n"));
  }
}
