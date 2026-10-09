import { type RunTarget, runArgs, type SecretScope } from "./args";
import { DEBUG_HOST } from "./net";

export type DebugRuntime = "node" | "bun" | "python";

export interface RelicDebugSettings {
  environment?: string;
  folder?: string;
  scope?: SecretScope;
}

export class UnsupportedDebugConfigError extends Error {}

const SCOPES = new Set(["client", "server", "shared"]);

export function readRelicDebugSettings(value: unknown): RelicDebugSettings | null {
  if (value === true) return {};
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const settings: RelicDebugSettings = {};
  if (typeof raw.environment === "string" && raw.environment)
    settings.environment = raw.environment;
  if (typeof raw.folder === "string" && raw.folder) settings.folder = raw.folder;
  if (typeof raw.scope === "string" && SCOPES.has(raw.scope)) {
    settings.scope = raw.scope as SecretScope;
  }
  return settings;
}

export function runtimeForDebugType(type: string): DebugRuntime | null {
  if (type === "node" || type === "pwa-node") return "node";
  if (type === "bun") return "bun";
  if (type === "debugpy" || type === "python") return "python";
  return null;
}

/**
 * On Unix the Relic runner starts the child with a cleared environment, so
 * launch.json `env` entries have to be re-applied after the secrets.
 */
export function envPrefix(env: unknown, platform: NodeJS.Platform): string[] {
  if (platform === "win32" || !env || typeof env !== "object") return [];
  const pairs = Object.entries(env as Record<string, unknown>)
    .filter(([key, value]) => typeof value === "string" && /^[A-Za-z_][A-Za-z0-9_]*$/.test(key))
    .map(([key, value]) => `${key}=${value as string}`);
  return pairs.length > 0 ? ["env", ...pairs] : [];
}

function toArgs(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  if (typeof value === "string" && value.trim()) return value.trim().split(/\s+/);
  return [];
}

function basename(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

const NODE_RUNTIMES = /^(node|tsx)(\.exe|\.cmd)?$/i;

export function nodeLaunchConfig<T extends Record<string, unknown>>(
  config: T,
  options: { cliPath: string; target: RunTarget; port: number; platform: NodeJS.Platform },
): T & {
  runtimeExecutable: string;
  runtimeArgs: string[];
  attachSimplePort: number;
  continueOnAttach: boolean;
} {
  const runtime =
    typeof config.runtimeExecutable === "string" && config.runtimeExecutable
      ? config.runtimeExecutable
      : "node";
  if (!NODE_RUNTIMES.test(basename(runtime))) {
    throw new UnsupportedDebugConfigError(
      `Relic can wrap "node" or "tsx" as runtimeExecutable, not "${runtime}". Point the configuration at node directly, or run the script as a Relic task.`,
    );
  }

  return {
    ...config,
    runtimeExecutable: options.cliPath,
    runtimeArgs: runArgs(options.target, [
      ...envPrefix(config.env, options.platform),
      runtime,
      `--inspect-brk=${DEBUG_HOST}:${options.port}`,
      ...toArgs(config.runtimeArgs),
    ]),
    attachSimplePort: options.port,
    continueOnAttach: config.stopOnEntry !== true,
  };
}

export function bunCommand(
  config: Record<string, unknown>,
  options: { port: number; platform: NodeJS.Platform },
): string[] {
  const program = typeof config.program === "string" ? config.program : undefined;
  if (!program) {
    throw new UnsupportedDebugConfigError("Relic Bun debugging needs a `program` to run.");
  }
  const runtime = typeof config.runtime === "string" && config.runtime ? config.runtime : "bun";
  return [
    ...envPrefix(config.env, options.platform),
    runtime,
    `--inspect-wait=${DEBUG_HOST}:${options.port}/relic`,
    ...toArgs(config.runtimeArgs),
    program,
    ...toArgs(config.args),
  ];
}

export function bunAttachUrl(port: number): string {
  return `ws://${DEBUG_HOST}:${port}/relic`;
}

const PYTHON_BOOTSTRAP = [
  "import os, sys, runpy",
  "libs, host, port, ready, mode, target = sys.argv[1:7]",
  "args = sys.argv[7:]",
  "libs and sys.path.insert(0, libs)",
  "import debugpy",
  "debugpy.listen((host, int(port)))",
  "open(ready, 'w').close()",
  "debugpy.wait_for_client()",
  "libs and sys.path[0] == libs and sys.path.pop(0)",
  "sys.argv = [target] + args",
  "mode == 'module' or sys.path.insert(0, os.path.dirname(os.path.abspath(target)))",
  "runpy.run_module(target, run_name='__main__', alter_sys=True) if mode == 'module' else runpy.run_path(target, run_name='__main__')",
].join("; ");

export function pythonCommand(
  config: Record<string, unknown>,
  options: {
    python: string | string[];
    debugpyLibs?: string;
    port: number;
    readyFile: string;
    platform: NodeJS.Platform;
  },
): string[] {
  const module = typeof config.module === "string" && config.module ? config.module : undefined;
  const program = typeof config.program === "string" && config.program ? config.program : undefined;
  if (!module && !program) {
    throw new UnsupportedDebugConfigError(
      "Relic Python debugging needs a `program` or `module` to run.",
    );
  }
  const python = Array.isArray(options.python) ? options.python : [options.python];
  return [
    ...envPrefix(config.env, options.platform),
    ...python,
    "-c",
    PYTHON_BOOTSTRAP,
    options.debugpyLibs ?? "",
    DEBUG_HOST,
    String(options.port),
    options.readyFile,
    module ? "module" : "file",
    (module ?? program)!,
    ...toArgs(config.args),
  ];
}
