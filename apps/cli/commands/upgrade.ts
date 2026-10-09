import { exec, execSync } from "node:child_process";
import { dirname } from "node:path";
import { trackEvent } from "@repo/logger";
import ora from "ora";
import pc from "picocolors";
import { exitWithTelemetry } from "../lib/telemetry";
import pkg from "../package.json";
import {
  CURL_INSTALL_COMMAND,
  detectInstallMethodFromExecutablePath,
  type InstallMethod,
  resolveExecutablePath,
  resolveRealPath,
} from "./upgrade.install-method";

function tryExec(cmd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(cmd, { encoding: "utf-8", timeout: 10_000 }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout);
    });
  });
}

/** `argv[0]` for script installs; `execPath` for standalone binaries (where `argv[0]` is "bun"). */
function executableCandidates(): string[] {
  const candidates = [resolveExecutablePath(), resolveRealPath(process.execPath)];
  return [...new Set(candidates.filter((path): path is string => !!path))];
}

async function detectInstallMethod(): Promise<{ method: InstallMethod; exePath: string | null }> {
  for (const exePath of executableCandidates()) {
    const fromExecutable = detectInstallMethodFromExecutablePath(exePath);
    if (fromExecutable) return { method: fromExecutable, exePath };
  }

  return { method: await probeInstallMethod(), exePath: null };
}

async function probeInstallMethod(): Promise<InstallMethod> {
  try {
    await tryExec("brew list relic 2>/dev/null");
    return "homebrew";
  } catch {
    // not installed via homebrew
  }

  try {
    const result = await tryExec("npm list -g relic 2>/dev/null");
    if (result.includes("relic@")) return "npm";
  } catch {
    // not installed via npm
  }

  try {
    const result = await tryExec("bun pm ls -g 2>/dev/null");
    if (result.includes("relic@")) return "bun";
  } catch {
    // not installed via bun
  }

  return "unknown";
}

async function warnAboutDuplicateInstallations(currentExe: string | null): Promise<void> {
  if (!currentExe) return;

  try {
    const stdout = await tryExec("which -a relic 2>/dev/null");
    const paths = [...new Set(stdout.trim().split("\n").filter(Boolean))];
    if (paths.length <= 1) return;

    const currentResolved = resolveRealPath(currentExe);
    const others = paths
      .map((p) => resolveRealPath(p))
      .filter((resolved) => resolved !== currentResolved);

    if (others.length === 0) return;

    console.log();
    console.log(
      pc.yellow(
        "  Multiple relic installs on PATH — you may still run an older copy in new shells.",
      ),
    );
    console.log(pc.dim(`  Upgraded via this binary: ${currentResolved}`));
    for (const other of others) {
      console.log(pc.dim(`  Also on PATH: ${other}`));
    }
    console.log(
      pc.dim(
        "  Remove the extra install (e.g. bun remove -g relic) or reorder PATH, then run relic version.",
      ),
    );
  } catch {
    // ignore
  }
}

async function getLatestVersion(): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5_000);
    const response = await fetch("https://registry.npmjs.org/relic/latest", {
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!response.ok) return null;
    const data = (await response.json()) as { version: string };
    return data.version;
  } catch {
    return null;
  }
}

const UPGRADE_COMMANDS: Record<Exclude<InstallMethod, "unknown">, string> = {
  homebrew: "brew upgrade relic",
  npm: "npm install -g relic@latest",
  bun: "bun install -g relic@latest",
  curl: CURL_INSTALL_COMMAND,
};

/** The install script honours `RELIC_INSTALL_DIR`; reuse the directory of the running binary. */
function upgradeEnv(method: InstallMethod, exePath: string | null): NodeJS.ProcessEnv {
  if (method !== "curl" || !exePath) return process.env;
  return { ...process.env, RELIC_INSTALL_DIR: dirname(dirname(exePath)) };
}

export default async function upgrade() {
  const spinner = ora("Checking for updates...").start();
  const runningExe = resolveExecutablePath();

  const [{ method, exePath }, latestVersion] = await Promise.all([
    detectInstallMethod(),
    getLatestVersion(),
  ]);

  const currentVersion = pkg.version;

  if (latestVersion && latestVersion === currentVersion) {
    spinner.succeed(pc.green(`Already on the latest version (v${currentVersion})`));
    trackEvent("cli_command_executed", { command: "upgrade", already_latest: true });
    return;
  }

  if (method === "unknown") {
    spinner.stop();
    console.log();
    console.log(`  ${pc.yellow(pc.bold("Could not detect installation method."))}`);
    console.log();
    if (latestVersion && latestVersion !== currentVersion) {
      console.log(
        `  ${pc.dim("Update available:")} ${pc.white(`v${currentVersion}`)} ${pc.dim("→")} ${pc.green(`v${latestVersion}`)}`,
      );
      console.log();
    }
    console.log(`  ${pc.dim("Upgrade manually using one of:")}`);
    console.log(`    ${pc.cyan("brew upgrade relic")}`);
    console.log(`    ${pc.cyan("npm install -g relic@latest")}`);
    console.log(`    ${pc.cyan(CURL_INSTALL_COMMAND)}`);
    console.log();
    console.log(
      `  ${pc.dim("Or download from")} ${pc.white("https://github.com/heycupola/relic/releases")}`,
    );
    console.log();
    trackEvent("cli_command_executed", { command: "upgrade", method: "unknown" });
    return;
  }

  const upgradeCmd = UPGRADE_COMMANDS[method];
  const versionInfo = latestVersion
    ? `${pc.white(`v${currentVersion}`)} ${pc.dim("→")} ${pc.green(`v${latestVersion}`)}`
    : "";

  spinner.text = latestVersion
    ? `Upgrading ${versionInfo} via ${method}...`
    : `Upgrading via ${method}...`;

  try {
    execSync(upgradeCmd, { stdio: "inherit", env: upgradeEnv(method, exePath) });
    spinner.succeed(
      latestVersion
        ? `Upgraded to ${pc.green(`v${latestVersion}`)} via ${method}`
        : `Upgraded successfully via ${method}`,
    );
    trackEvent("cli_command_executed", {
      command: "upgrade",
      method,
      from: currentVersion,
      to: latestVersion,
    });
    await warnAboutDuplicateInstallations(runningExe);
  } catch {
    spinner.fail(pc.red(`Failed to upgrade via ${method}`));
    console.log(pc.dim(`  Try manually: ${upgradeCmd}`));
    trackEvent("cli_command_executed", {
      command: "upgrade",
      method,
      success: false,
    });
    await exitWithTelemetry(1);
  }
}
