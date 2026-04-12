import { execSync } from "node:child_process";
import { trackEvent } from "@repo/logger";
import ora from "ora";
import pc from "picocolors";
import pkg from "../package.json";

type InstallMethod = "homebrew" | "npm" | "bun" | "unknown";

function detectInstallMethod(): InstallMethod {
  try {
    execSync("brew list relic 2>/dev/null", { stdio: "pipe" });
    return "homebrew";
  } catch (_) {
    // not installed via homebrew
  }

  try {
    const result = execSync("npm list -g relic 2>/dev/null", {
      encoding: "utf-8",
      stdio: "pipe",
    });
    if (result.includes("relic@")) return "npm";
  } catch (_) {
    // not installed via npm
  }

  try {
    const result = execSync("bun pm ls -g 2>/dev/null", {
      encoding: "utf-8",
      stdio: "pipe",
    });
    if (result.includes("relic")) return "bun";
  } catch (_) {
    // not installed via bun
  }

  return "unknown";
}

async function getLatestVersion(): Promise<string | null> {
  try {
    const response = await fetch("https://registry.npmjs.org/relic/latest");
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
};

export default async function upgrade() {
  const spinner = ora("Checking for updates...").start();

  const [method, latestVersion] = await Promise.all([detectInstallMethod(), getLatestVersion()]);

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
    execSync(upgradeCmd, { stdio: "pipe" });
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
  } catch {
    spinner.fail(pc.red(`Failed to upgrade via ${method}`));
    console.log(pc.dim(`  Try manually: ${upgradeCmd}`));
    trackEvent("cli_command_executed", {
      command: "upgrade",
      method,
      success: false,
    });
    process.exit(1);
  }
}
