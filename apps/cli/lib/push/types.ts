export type PushTargetId = "vercel" | "cloudflare" | "github" | "fly";

export const PushExitCode = {
  Success: 0,
  Failure: 1,
  Usage: 2,
  AuthRequired: 3,
  Cancelled: 4,
} as const;

export type PushExitCodeValue = (typeof PushExitCode)[keyof typeof PushExitCode];

export class PushError extends Error {
  exitCode: PushExitCodeValue;
  hint?: string;

  constructor(message: string, exitCode: PushExitCodeValue = PushExitCode.Failure, hint?: string) {
    super(message);
    this.name = "PushError";
    this.exitCode = exitCode;
    this.hint = hint;
  }
}

export class PlatformAuthError extends PushError {
  constructor(message: string, hint: string) {
    super(message, PushExitCode.AuthRequired, hint);
    this.name = "PlatformAuthError";
  }
}

export class PushUsageError extends PushError {
  constructor(message: string, hint?: string) {
    super(message, PushExitCode.Usage, hint);
    this.name = "PushUsageError";
  }
}

export interface ExecOptions {
  input?: string;
  cwd?: string;
  env?: Record<string, string | undefined>;
}

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type ExecFn = (
  command: string,
  args: string[],
  options?: ExecOptions,
) => Promise<ExecResult>;

export interface PushDeps {
  fetch: typeof fetch;
  exec: ExecFn;
  which: (command: string) => string | null;
  readFile: (path: string) => Promise<string | null>;
  exists: (path: string) => Promise<boolean>;
  env: Record<string, string | undefined>;
  cwd: string;
  homedir: string;
  platform: NodeJS.Platform;
}

export interface RemoteSecret {
  name: string;
  /** Only set when the platform lets us read the current value back. */
  value?: string;
}

export interface PushOptions {
  environment: string;
  target: string;
  folder?: string;
  scope?: string;
  project?: string;
  dryRun?: boolean;
  prune?: boolean;
  yes?: boolean;

  vercelProject?: string;
  vercelTeam?: string;
  vercelTarget?: string[];

  worker?: string;
  wranglerEnv?: string;

  githubRepo?: string;
  githubEnv?: string;

  flyApp?: string;
  flyStage?: boolean;
}

export interface PlatformAdapter {
  id: PushTargetId;
  label: string;
  /** Names only. Recorded in the Relic audit log, so it must never contain values. */
  destination: string;
  productionLike: boolean;
  /** Returns one message per rejected secret. Messages may name secrets but must not include values. */
  validate?(secrets: Record<string, string>): string[];
  list(): Promise<RemoteSecret[]>;
  upsert(secrets: Record<string, string>): Promise<void>;
  delete(names: string[]): Promise<void>;
}

export interface AdapterFactory {
  id: PushTargetId;
  label: string;
  aliases: string[];
  create(options: PushOptions, deps: PushDeps): Promise<PlatformAdapter>;
}
