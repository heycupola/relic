import { existsSync } from "node:fs";
import { isAbsolute } from "node:path";
import { createLogger, trackEvent } from "@repo/logger";
import pc from "picocolors";
import {
  executeWithSecrets,
  getAuthMode,
  handleRunError,
  loadSecrets,
  type RunOptions,
  validateRunOptions,
} from "./run";

const log = createLogger("cli");

export interface ShellOptions extends RunOptions {
  force?: boolean;
}

export interface ShellContext {
  environment: string;
  projectId?: string;
  folder?: string;
  scope?: string;
}

export function isInsideRelicShell(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.RELIC_SHELL === "1";
}

export function resolveShell(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  exists: (path: string) => boolean = existsSync,
): string {
  const shell = env.SHELL;
  if (shell && (!isAbsolute(shell) || exists(shell))) {
    return shell;
  }

  if (platform === "win32") {
    return env.COMSPEC || "cmd.exe";
  }

  return "/bin/sh";
}

export function buildShellEnv(
  secrets: Record<string, string>,
  context: ShellContext,
): Record<string, string> {
  const markers: Record<string, string> = {
    RELIC_SHELL: "1",
    RELIC_ENVIRONMENT: context.environment,
  };
  if (context.projectId) markers.RELIC_PROJECT_ID = context.projectId;
  if (context.folder) markers.RELIC_FOLDER = context.folder;
  if (context.scope) markers.RELIC_SCOPE = context.scope;

  return { ...secrets, ...markers };
}

export default async function shell(options: ShellOptions) {
  validateRunOptions(options);

  if (isInsideRelicShell() && !options.force) {
    const current = process.env.RELIC_ENVIRONMENT;
    console.error();
    console.error(
      `  ${pc.red(pc.bold("Already inside a relic shell"))}${current ? pc.dim(` (${current})`) : ""}`,
    );
    console.error();
    console.error(
      pc.dim(
        `  Type ${pc.white("exit")} to leave it first, or pass ${pc.white("--force")} to nest.`,
      ),
    );
    console.error();
    process.exit(1);
  }

  const mode = getAuthMode();
  const startTime = Date.now();
  trackEvent("cli_shell_started", {
    has_folder: !!options.folder,
    has_scope: !!options.scope,
    nested: isInsideRelicShell(),
    mode,
  });

  const shellPath = resolveShell();

  let secretCount: number;
  let exitCode: number;
  try {
    const { secrets, count, projectId } = await loadSecrets(options, mode);
    secretCount = count;

    const env = buildShellEnv(secrets, {
      environment: options.environment,
      projectId,
      folder: options.folder,
      scope: options.scope,
    });

    console.error(
      pc.dim(
        `  Entering relic shell for ${pc.white(options.environment)}. Type ${pc.white("exit")} to leave.`,
      ),
    );
    console.error();

    exitCode = await executeWithSecrets([shellPath], env);
  } catch (err) {
    log.error("Shell failed", err);
    trackEvent("cli_shell_completed", { success: false, duration_ms: Date.now() - startTime });
    return handleRunError(err);
  }

  console.error();
  console.error(pc.dim(`  Left relic shell for ${options.environment}.`));

  trackEvent("cli_shell_completed", {
    secret_count: secretCount,
    exit_code: exitCode,
    duration_ms: Date.now() - startTime,
  });

  process.exit(exitCode);
}
