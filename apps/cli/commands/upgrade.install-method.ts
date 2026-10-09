import { realpathSync } from "node:fs";
import { resolve } from "node:path";

export type InstallMethod = "homebrew" | "npm" | "bun" | "curl" | "unknown";

export const CURL_INSTALL_COMMAND = "curl -fsSL https://withrelic.com/install | bash";

function isCurlInstallPath(normalized: string, env: Record<string, string | undefined>): boolean {
  if (normalized.includes("/.relic/bin/")) return true;
  if (!env.RELIC_INSTALL_DIR) return false;
  const binDir = `${resolve(env.RELIC_INSTALL_DIR).replace(/\\/g, "/").replace(/\/$/, "")}/bin/`;
  return normalized.startsWith(binDir);
}

export function resolveExecutablePath(): string | null {
  try {
    const candidate = process.argv[0];
    if (!candidate) return null;
    return realpathSync(candidate);
  } catch {
    return null;
  }
}

/** Infer package manager from the running relic binary (not from what else is installed). */
export function detectInstallMethodFromExecutablePath(
  exePath: string,
  env: Record<string, string | undefined> = process.env,
): InstallMethod | null {
  const normalized = exePath.replace(/\\/g, "/");

  if (isCurlInstallPath(normalized, env)) {
    return "curl";
  }

  if (normalized.includes("/.bun/install/global/")) {
    return "bun";
  }

  if (/\/Cellar\/relic\//i.test(normalized)) {
    return "homebrew";
  }

  if (normalized.includes("/node_modules/")) {
    return "npm";
  }

  return null;
}

export function resolveRealPath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}
