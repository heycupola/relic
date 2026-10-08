import { realpathSync } from "node:fs";

export type InstallMethod = "homebrew" | "npm" | "bun" | "unknown";

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
export function detectInstallMethodFromExecutablePath(exePath: string): InstallMethod | null {
  const normalized = exePath.replace(/\\/g, "/");

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
