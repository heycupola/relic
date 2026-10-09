import { execFile } from "node:child_process";
import type { SecretScope } from "./args";

export type CliErrorKind =
  | "not_installed"
  | "not_logged_in"
  | "outdated"
  | "no_config"
  | "not_found"
  | "failed";

export class RelicCliError extends Error {
  constructor(
    readonly kind: CliErrorKind,
    message: string,
  ) {
    super(message);
  }
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface ProjectInfo {
  id: string;
  name: string;
  environments: Array<{ id: string; name: string; folders: Array<{ id: string; name: string }> }>;
}

export interface SecretNames {
  projectId: string;
  environment: string;
  folder: string | null;
  secrets: Array<{ name: string; scope: SecretScope; folder: string | null }>;
}

const ERROR_KINDS: Record<string, CliErrorKind> = {
  not_logged_in: "not_logged_in",
  no_config: "no_config",
  environment_not_found: "not_found",
  folder_not_found: "not_found",
  project_not_found: "not_found",
};

const ANSI = new RegExp(String.raw`\x1b\[[0-9;]*m`, "g");

function stripAnsi(text: string): string {
  return text.replace(ANSI, "");
}

function tryParseJson(stdout: string): unknown {
  const trimmed = stdout.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.search(/^[[{]/m);
    if (start <= 0) return undefined;
    try {
      return JSON.parse(trimmed.slice(start));
    } catch {
      return undefined;
    }
  }
}

export function parseJsonResult<T>(result: ExecResult): T {
  const data = tryParseJson(result.stdout);

  if (data && typeof data === "object" && !Array.isArray(data) && "error" in data) {
    const error = (data as { error: { code?: string; message?: string } }).error;
    throw new RelicCliError(
      ERROR_KINDS[error.code ?? ""] ?? "failed",
      error.message ?? "Relic CLI failed",
    );
  }

  if (result.exitCode !== 0 || data === undefined) {
    const stderr = stripAnsi(result.stderr).trim();
    if (/unknown (option|command)/i.test(stderr)) {
      throw new RelicCliError(
        "outdated",
        "Your Relic CLI is too old for the editor extension. Run `relic upgrade`.",
      );
    }
    if (/not logged in/i.test(stderr)) {
      throw new RelicCliError("not_logged_in", "Not logged in. Run `relic login`.");
    }
    if (/is not recognized as an internal or external command/i.test(stderr)) {
      throw new RelicCliError("not_installed", "The Relic CLI was not found.");
    }
    throw new RelicCliError("failed", stderr || `Relic CLI exited with code ${result.exitCode}`);
  }

  return data as T;
}

export function parseVersion(stdout: string): string | null {
  return stdout.match(/\d+\.\d+\.\d+(?:[-+][\w.]+)?/)?.[0] ?? null;
}

/**
 * Older CLIs answer `relic <unknown> --help` with the root help and exit 0, so
 * support is detected from the subcommand's own usage line.
 */
export function isCommandHelp(result: ExecResult, command: string): boolean {
  if (result.exitCode !== 0) return false;
  const escaped = command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(String.raw`Usage:\s+relic ${escaped}\b`).test(stripAnsi(result.stdout));
}

export class RelicCli {
  private readonly commandSupport = new Map<string, Promise<boolean>>();

  constructor(
    private readonly resolvePath: () => string,
    private readonly platform: NodeJS.Platform = process.platform,
  ) {}

  get path(): string {
    return this.resolvePath() || "relic";
  }

  exec(args: string[], cwd?: string, timeout = 60_000): Promise<ExecResult> {
    const isWindows = this.platform === "win32";
    const file = isWindows ? `"${this.path}"` : this.path;
    const argv = isWindows ? args.map((arg) => `"${arg.replace(/"/g, '""')}"`) : args;

    return new Promise((resolve, reject) => {
      execFile(
        file,
        argv,
        {
          cwd,
          timeout,
          maxBuffer: 10 * 1024 * 1024,
          shell: isWindows,
          windowsHide: true,
          env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
        },
        (error, stdout, stderr) => {
          if (error && (error as NodeJS.ErrnoException).code === "ENOENT") {
            reject(new RelicCliError("not_installed", `Relic CLI not found at "${this.path}".`));
            return;
          }
          const code = typeof error?.code === "number" ? error.code : error ? 1 : 0;
          resolve({ stdout: String(stdout), stderr: String(stderr), exitCode: code });
        },
      );
    });
  }

  async version(): Promise<string | null> {
    const result = await this.exec(["--version"], undefined, 15_000);
    if (result.exitCode !== 0) {
      parseJsonResult(result);
    }
    return parseVersion(result.stdout);
  }

  supports(command: string): Promise<boolean> {
    const key = `${this.path}\0${command}`;
    let pending = this.commandSupport.get(key);
    if (!pending) {
      pending = this.exec([command, "--help"], undefined, 15_000)
        .then((result) => isCommandHelp(result, command))
        .catch(() => false);
      this.commandSupport.set(key, pending);
    }
    return pending;
  }

  clearCapabilities(): void {
    this.commandSupport.clear();
  }

  async project(projectId: string, cwd: string): Promise<ProjectInfo> {
    const result = await this.exec(["projects", "--json", "--project", projectId], cwd);
    const projects = parseJsonResult<ProjectInfo[]>(result);
    const project = projects.find((p) => p.id === projectId);
    if (!project) {
      throw new RelicCliError("not_found", `Project ${projectId} was not found in your account.`);
    }
    return project;
  }

  async secretNames(
    projectId: string,
    environment: string,
    cwd: string,
    folder?: string,
  ): Promise<SecretNames> {
    const args = ["secrets", "--json", "--project", projectId, "-e", environment];
    if (folder) args.push("-f", folder);
    return parseJsonResult<SecretNames>(await this.exec(args, cwd));
  }
}
