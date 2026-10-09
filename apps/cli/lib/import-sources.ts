import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import {
  detectType,
  type InvalidLine,
  JsonFormatError,
  parseDotenv,
  parseJsonSecrets,
} from "@repo/bulk-import";

export type ImportFormat = "env" | "json";
export type ProviderSource = "doppler" | "infisical" | "vercel" | "1password";
export type ImportSourceKind = "file" | "stdin" | ProviderSource;

export const PROVIDER_SOURCES: readonly ProviderSource[] = [
  "doppler",
  "infisical",
  "vercel",
  "1password",
];

const VERCEL_TARGETS = ["production", "preview", "development"] as const;
const VERCEL_API_URL = "https://api.vercel.com";
const MAX_VERCEL_PAGES = 50;
const MAX_STDERR_LENGTH = 500;

export interface SourceOptions {
  environment: string;
  format?: ImportFormat;
  dopplerProject?: string;
  dopplerConfig?: string;
  infisicalEnv?: string;
  infisicalPath?: string;
  infisicalProject?: string;
  vercelProject?: string;
  vercelTeam?: string;
  vercelTarget?: string;
  opItem?: string;
  opVault?: string;
}

export interface SkippedEntry {
  key: string;
  reason: string;
}

export interface SourceResult {
  kind: ImportSourceKind;
  label: string;
  format?: ImportFormat;
  filePath?: string;
  items: unknown[];
  skipped: SkippedEntry[];
  invalidLines: InvalidLine[];
  warnings: string[];
}

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface SourceDeps {
  exec: (cmd: string[]) => Promise<ExecResult>;
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  readFile: (path: string) => Promise<string | null>;
  readStdin: () => Promise<string>;
  stdinIsTTY: boolean;
  env: Record<string, string | undefined>;
  cwd: string;
  home: string;
  platform: NodeJS.Platform;
}

export class ImportSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportSourceError";
  }
}

async function defaultExec(cmd: string[]): Promise<ExecResult> {
  const proc = Bun.spawn(cmd, { stdin: "inherit", stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { exitCode, stdout, stderr };
}

async function defaultReadFile(path: string): Promise<string | null> {
  const file = Bun.file(path);
  if (!(await file.exists())) return null;
  return await file.text();
}

export function createDefaultSourceDeps(): SourceDeps {
  return {
    exec: defaultExec,
    fetch: (url, init) => fetch(url, init),
    readFile: defaultReadFile,
    readStdin: () => Bun.stdin.text(),
    stdinIsTTY: !!process.stdin.isTTY,
    env: process.env,
    cwd: process.cwd(),
    home: homedir(),
    platform: process.platform,
  };
}

export function resolveSourceKind(source: string | undefined): ImportSourceKind {
  if (source === "-") return "stdin";
  if (source === "op") return "1password";
  if (source && (PROVIDER_SOURCES as readonly string[]).includes(source)) {
    return source as ProviderSource;
  }
  return "file";
}

function sniffFormat(content: string): ImportFormat {
  const trimmed = content.trimStart();
  return trimmed.startsWith("{") || trimmed.startsWith("[") ? "json" : "env";
}

function parseContent(
  content: string,
  format: ImportFormat,
): Pick<SourceResult, "items" | "invalidLines"> {
  if (format === "json") {
    try {
      return { items: parseJsonSecrets(content), invalidLines: [] };
    } catch (error) {
      if (error instanceof JsonFormatError) throw new ImportSourceError(error.message);
      throw error;
    }
  }
  const { secrets, invalidLines } = parseDotenv(content);
  return { items: secrets, invalidLines };
}

function emptyResult(kind: ImportSourceKind, label: string): SourceResult {
  return { kind, label, items: [], skipped: [], invalidLines: [], warnings: [] };
}

async function readFileSource(
  source: string | undefined,
  options: SourceOptions,
  deps: SourceDeps,
): Promise<SourceResult> {
  const filePath = resolve(deps.cwd, source ?? ".env");
  const label = source ?? ".env";
  const content = await deps.readFile(filePath);
  if (content === null) {
    throw new ImportSourceError(`File not found: ${label}`);
  }

  const format =
    options.format ?? (basename(filePath).endsWith(".json") ? "json" : sniffFormat(content));

  return { ...emptyResult("file", label), format, filePath, ...parseContent(content, format) };
}

async function readStdinSource(options: SourceOptions, deps: SourceDeps): Promise<SourceResult> {
  if (deps.stdinIsTTY) {
    throw new ImportSourceError("Pipe secrets into stdin when using '-' as the source.");
  }
  const content = await deps.readStdin();
  const format = options.format ?? sniffFormat(content);
  return { ...emptyResult("stdin", "stdin"), format, ...parseContent(content, format) };
}

async function runProviderCli(
  deps: SourceDeps,
  cmd: string[],
  displayName: string,
  installUrl: string,
): Promise<string> {
  let result: ExecResult;
  try {
    result = await deps.exec(cmd);
  } catch {
    throw new ImportSourceError(
      `Could not run the ${displayName} CLI (${cmd[0]}). Install it from ${installUrl} and sign in.`,
    );
  }

  if (result.exitCode !== 0) {
    const detail = result.stderr.trim().slice(0, MAX_STDERR_LENGTH);
    throw new ImportSourceError(
      `${displayName} CLI exited with code ${result.exitCode}${detail ? `: ${detail}` : ""}`,
    );
  }

  return result.stdout;
}

function parseProviderJson(stdout: string, displayName: string): unknown {
  try {
    return JSON.parse(stdout);
  } catch {
    throw new ImportSourceError(`${displayName} CLI returned output that is not valid JSON.`);
  }
}

function toStringItem(key: string, value: string) {
  return { key, value, type: detectType(value) };
}

async function readDopplerSource(options: SourceOptions, deps: SourceDeps): Promise<SourceResult> {
  const cmd = ["doppler", "secrets", "download", "--no-file", "--format", "json"];
  if (options.dopplerProject) cmd.push("--project", options.dopplerProject);
  if (options.dopplerConfig) cmd.push("--config", options.dopplerConfig);

  const stdout = await runProviderCli(
    deps,
    cmd,
    "Doppler",
    "https://docs.doppler.com/docs/install-cli",
  );
  const data = parseProviderJson(stdout, "Doppler");
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new ImportSourceError("Doppler CLI returned an unexpected JSON shape.");
  }

  const scope = [options.dopplerProject, options.dopplerConfig].filter(Boolean).join("/");
  const result = emptyResult("doppler", scope ? `Doppler (${scope})` : "Doppler");

  for (const [key, value] of Object.entries(data)) {
    if (key.startsWith("DOPPLER_")) {
      result.skipped.push({ key, reason: "Doppler metadata" });
      continue;
    }
    result.items.push(typeof value === "string" ? toStringItem(key, value) : { key, value });
  }

  return result;
}

interface InfisicalSecret {
  key?: unknown;
  value?: unknown;
  type?: unknown;
}

async function readInfisicalSource(
  options: SourceOptions,
  deps: SourceDeps,
): Promise<SourceResult> {
  const cmd = ["infisical", "export", "--format=json", "--silent"];
  if (options.infisicalEnv) cmd.push(`--env=${options.infisicalEnv}`);
  if (options.infisicalPath) cmd.push(`--path=${options.infisicalPath}`);
  if (options.infisicalProject) cmd.push(`--projectId=${options.infisicalProject}`);

  const stdout = await runProviderCli(
    deps,
    cmd,
    "Infisical",
    "https://infisical.com/docs/cli/overview",
  );
  const data = parseProviderJson(stdout, "Infisical");
  if (!Array.isArray(data)) {
    throw new ImportSourceError("Infisical CLI returned an unexpected JSON shape.");
  }

  const scope = [options.infisicalEnv, options.infisicalPath].filter(Boolean).join(" ");
  const result = emptyResult("infisical", scope ? `Infisical (${scope})` : "Infisical");

  // NOTE: personal overrides can share a key with the shared secret; the shared value wins
  const byKey = new Map<string, InfisicalSecret>();
  const unkeyed: InfisicalSecret[] = [];
  for (const entry of data as InfisicalSecret[]) {
    if (typeof entry?.key !== "string") {
      unkeyed.push(entry);
      continue;
    }
    const current = byKey.get(entry.key);
    if (!current || (current.type === "personal" && entry.type !== "personal")) {
      byKey.set(entry.key, entry);
    }
  }

  for (const entry of [...byKey.values(), ...unkeyed]) {
    const key = entry?.key;
    const value = entry?.value;
    result.items.push(
      typeof key === "string" && typeof value === "string"
        ? toStringItem(key, value)
        : { key, value },
    );
  }

  return result;
}

interface VercelEnv {
  id?: string;
  key?: string;
  value?: string;
  type?: string;
  target?: string | string[];
  gitBranch?: string;
  decrypted?: boolean;
  system?: boolean;
}

interface VercelEnvResponse {
  envs?: VercelEnv[];
  pagination?: { next?: number | null };
  hiddenProductionEnvCount?: number;
}

function vercelAuthFileCandidates(deps: SourceDeps): string[] {
  const candidates: string[] = [];
  if (deps.platform === "darwin") {
    candidates.push(join(deps.home, "Library", "Application Support", "com.vercel.cli"));
  } else if (deps.platform === "win32") {
    if (deps.env.APPDATA) {
      candidates.push(join(deps.env.APPDATA, "com.vercel.cli", "Data"));
      candidates.push(join(deps.env.APPDATA, "com.vercel.cli"));
    }
    if (deps.env.LOCALAPPDATA) {
      candidates.push(join(deps.env.LOCALAPPDATA, "com.vercel.cli", "Data"));
    }
  }
  candidates.push(
    join(deps.env.XDG_DATA_HOME || join(deps.home, ".local", "share"), "com.vercel.cli"),
  );
  candidates.push(join(deps.home, ".now"));
  return candidates.map((dir) => join(dir, "auth.json"));
}

async function readJsonFile(deps: SourceDeps, path: string): Promise<Record<string, unknown>> {
  const content = await deps.readFile(path);
  if (content === null) return {};
  try {
    const data = JSON.parse(content);
    return typeof data === "object" && data !== null ? data : {};
  } catch {
    return {};
  }
}

async function resolveVercelToken(deps: SourceDeps): Promise<string> {
  if (deps.env.VERCEL_TOKEN) return deps.env.VERCEL_TOKEN;

  for (const path of vercelAuthFileCandidates(deps)) {
    const auth = await readJsonFile(deps, path);
    if (typeof auth.token === "string" && auth.token) return auth.token;
  }

  throw new ImportSourceError(
    "No Vercel token found. Set VERCEL_TOKEN or run `vercel login` first.",
  );
}

async function resolveVercelProject(
  options: SourceOptions,
  deps: SourceDeps,
): Promise<{ project: string; teamId?: string }> {
  const linked = await readJsonFile(deps, join(deps.cwd, ".vercel", "project.json"));
  const linkedProject = typeof linked.projectId === "string" ? linked.projectId : undefined;
  const linkedOrg = typeof linked.orgId === "string" ? linked.orgId : undefined;

  const project = options.vercelProject ?? deps.env.VERCEL_PROJECT_ID ?? linkedProject;
  if (!project) {
    throw new ImportSourceError(
      "No Vercel project found. Pass --vercel-project or run `vercel link` in this directory.",
    );
  }

  const org = options.vercelTeam ?? deps.env.VERCEL_ORG_ID ?? linkedOrg;
  // NOTE: personal accounts have a user ID as orgId, which the API rejects as a teamId
  const teamId = org && (options.vercelTeam || org.startsWith("team_")) ? org : undefined;

  return { project, teamId };
}

function resolveVercelTarget(options: SourceOptions): string {
  const target = options.vercelTarget ?? options.environment;
  if ((VERCEL_TARGETS as readonly string[]).includes(target)) return target;
  throw new ImportSourceError(
    options.vercelTarget
      ? `Invalid --vercel-target: use ${VERCEL_TARGETS.join(", ")}.`
      : `Pass --vercel-target (${VERCEL_TARGETS.join(", ")}); "${options.environment}" is not a Vercel target.`,
  );
}

async function vercelRequest<T>(deps: SourceDeps, token: string, url: string): Promise<T> {
  const response = await deps.fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (response.ok) return (await response.json()) as T;

  if (response.status === 401 || response.status === 403) {
    throw new ImportSourceError(
      `Vercel rejected the token (HTTP ${response.status}). Check VERCEL_TOKEN, --vercel-team, or run \`vercel login\`.`,
    );
  }
  if (response.status === 404) {
    throw new ImportSourceError(
      "Vercel project not found. Check --vercel-project and --vercel-team.",
    );
  }
  throw new ImportSourceError(`Vercel API request failed (HTTP ${response.status}).`);
}

function targetsOf(env: VercelEnv): string[] {
  if (Array.isArray(env.target)) return env.target;
  return env.target ? [env.target] : [];
}

async function readVercelSource(options: SourceOptions, deps: SourceDeps): Promise<SourceResult> {
  const target = resolveVercelTarget(options);
  const token = await resolveVercelToken(deps);
  const { project, teamId } = await resolveVercelProject(options, deps);

  const projectPath = `${VERCEL_API_URL}/v10/projects/${encodeURIComponent(project)}/env`;
  const teamQuery = teamId ? `&teamId=${encodeURIComponent(teamId)}` : "";

  const envs: VercelEnv[] = [];
  const result = emptyResult("vercel", `Vercel (${target})`);
  let until: number | null | undefined;

  for (let page = 0; page < MAX_VERCEL_PAGES; page++) {
    const untilQuery = until ? `&until=${until}` : "";
    const data = await vercelRequest<VercelEnvResponse & VercelEnv>(
      deps,
      token,
      `${projectPath}?decrypt=true${teamQuery}${untilQuery}`,
    );

    if (Array.isArray(data.envs)) {
      envs.push(...data.envs);
    } else if (typeof data.key === "string") {
      envs.push(data);
    }

    if (data.hiddenProductionEnvCount) {
      result.warnings.push(
        `Vercel hid ${data.hiddenProductionEnvCount} production variable(s) from this token.`,
      );
    }

    until = data.pagination?.next;
    if (!until) break;
  }

  for (const env of envs) {
    if (typeof env.key !== "string" || !targetsOf(env).includes(target)) continue;

    if (env.gitBranch) {
      result.skipped.push({ key: env.key, reason: `Vercel branch override (${env.gitBranch})` });
      continue;
    }
    if (env.type === "sensitive") {
      result.skipped.push({ key: env.key, reason: "Vercel sensitive value (not readable)" });
      continue;
    }
    if (env.type === "system" || env.system) {
      result.skipped.push({ key: env.key, reason: "Vercel system variable" });
      continue;
    }
    if (env.type === "secret") {
      result.skipped.push({ key: env.key, reason: "legacy Vercel secret reference" });
      continue;
    }

    let value = env.value;
    if (env.type === "encrypted" && env.decrypted !== true && env.id) {
      const single = await vercelRequest<VercelEnv>(
        deps,
        token,
        `${VERCEL_API_URL}/v1/projects/${encodeURIComponent(project)}/env/${encodeURIComponent(env.id)}?${teamQuery.slice(1)}`,
      );
      value = single.decrypted === false ? undefined : single.value;
    }

    if (typeof value !== "string") {
      result.skipped.push({ key: env.key, reason: "Vercel value could not be decrypted" });
      continue;
    }

    result.items.push(toStringItem(env.key, value));
  }

  return result;
}

interface OnePasswordField {
  label?: unknown;
  value?: unknown;
  purpose?: unknown;
}

async function readOnePasswordSource(
  options: SourceOptions,
  deps: SourceDeps,
): Promise<SourceResult> {
  if (!options.opItem) {
    throw new ImportSourceError("Pass --op-item <item> to choose which 1Password item to import.");
  }

  const cmd = ["op", "item", "get", options.opItem, "--format", "json"];
  if (options.opVault) cmd.push("--vault", options.opVault);

  const stdout = await runProviderCli(
    deps,
    cmd,
    "1Password",
    "https://developer.1password.com/docs/cli/get-started",
  );
  const data = parseProviderJson(stdout, "1Password") as { fields?: OnePasswordField[] };
  if (!Array.isArray(data?.fields)) {
    throw new ImportSourceError("1Password CLI returned an item without fields.");
  }

  const result = emptyResult("1password", `1Password (${options.opItem})`);

  for (const field of data.fields) {
    if (typeof field.label !== "string" || field.label === "") continue;
    if (field.purpose === "NOTES") {
      result.skipped.push({ key: field.label, reason: "1Password notes field" });
      continue;
    }
    if (typeof field.value !== "string" || field.value === "") {
      result.skipped.push({ key: field.label, reason: "empty 1Password field" });
      continue;
    }
    result.items.push(toStringItem(field.label, field.value));
  }

  return result;
}

export async function readImportSource(
  source: string | undefined,
  options: SourceOptions,
  deps: SourceDeps = createDefaultSourceDeps(),
): Promise<SourceResult> {
  switch (resolveSourceKind(source)) {
    case "stdin":
      return readStdinSource(options, deps);
    case "doppler":
      return readDopplerSource(options, deps);
    case "infisical":
      return readInfisicalSource(options, deps);
    case "vercel":
      return readVercelSource(options, deps);
    case "1password":
      return readOnePasswordSource(options, deps);
    default:
      return readFileSource(source, options, deps);
  }
}
