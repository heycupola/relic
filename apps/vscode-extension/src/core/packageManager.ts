export type PackageManager = "bun" | "pnpm" | "yarn" | "npm";

const LOCKFILES: Array<[string, PackageManager]> = [
  ["bun.lock", "bun"],
  ["bun.lockb", "bun"],
  ["pnpm-lock.yaml", "pnpm"],
  ["yarn.lock", "yarn"],
  ["package-lock.json", "npm"],
];

export function detectPackageManager(
  fileNames: Iterable<string>,
  packageManagerField?: string,
): PackageManager {
  const declared = packageManagerField?.split("@")[0];
  if (declared === "bun" || declared === "pnpm" || declared === "yarn" || declared === "npm") {
    return declared;
  }
  const names = new Set(fileNames);
  for (const [lockfile, manager] of LOCKFILES) {
    if (names.has(lockfile)) return manager;
  }
  return "npm";
}

export function scriptCommand(manager: PackageManager, script: string): string[] {
  return [manager, "run", script];
}

export function readScripts(packageJson: string): {
  scripts: string[];
  packageManager?: string;
} {
  try {
    const data = JSON.parse(packageJson) as {
      scripts?: Record<string, unknown>;
      packageManager?: unknown;
    };
    const scripts = Object.entries(data.scripts ?? {})
      .filter(([, value]) => typeof value === "string")
      .map(([name]) => name);
    return {
      scripts,
      packageManager: typeof data.packageManager === "string" ? data.packageManager : undefined,
    };
  } catch {
    return { scripts: [] };
  }
}
