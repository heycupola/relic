import { join } from "node:path";
import {
  type AdapterFactory,
  PlatformAuthError,
  type PlatformAdapter,
  PushError,
  type PushDeps,
  type PushOptions,
  PushUsageError,
  type RemoteSecret,
} from "./types";
import { ENV_NAME_PATTERN, splitList } from "./util";

const VERCEL_API = "https://api.vercel.com";
const VERCEL_TARGETS = ["production", "preview", "development"] as const;
const LOGIN_HINT = "Run `vercel login`, or set VERCEL_TOKEN (https://vercel.com/account/tokens).";

export type VercelTarget = (typeof VERCEL_TARGETS)[number];

interface VercelEnv {
  id: string;
  key: string;
  value?: string;
  type: string;
  target?: VercelTarget[] | VercelTarget;
  gitBranch?: string | null;
  decrypted?: boolean;
}

interface VercelAuthFile {
  token?: string;
  expiresAt?: number;
}

interface VercelProjectLink {
  projectId?: string;
  orgId?: string;
}

/** Locations used by the Vercel CLI (XDG data dir via xdg-app-paths, plus the legacy ~/.now). */
export function vercelAuthFilePaths(deps: PushDeps): string[] {
  const paths: string[] = [];
  const xdgDataHome = deps.env.XDG_DATA_HOME;

  if (xdgDataHome) {
    paths.push(join(xdgDataHome, "com.vercel.cli", "auth.json"));
  } else if (deps.platform === "darwin") {
    paths.push(join(deps.homedir, "Library", "Application Support", "com.vercel.cli", "auth.json"));
  } else if (deps.platform === "win32") {
    const appData = deps.env.APPDATA ?? join(deps.homedir, "AppData", "Roaming");
    paths.push(join(appData, "xdg.data", "com.vercel.cli", "auth.json"));
  } else {
    paths.push(join(deps.homedir, ".local", "share", "com.vercel.cli", "auth.json"));
  }

  paths.push(join(deps.homedir, ".now", "auth.json"));
  return paths;
}

export async function resolveVercelToken(deps: PushDeps): Promise<string> {
  if (deps.env.VERCEL_TOKEN) return deps.env.VERCEL_TOKEN;

  for (const path of vercelAuthFilePaths(deps)) {
    const content = await deps.readFile(path);
    if (!content) continue;

    let auth: VercelAuthFile;
    try {
      auth = JSON.parse(content) as VercelAuthFile;
    } catch {
      continue;
    }
    if (!auth.token) continue;

    if (auth.expiresAt && auth.expiresAt * 1000 <= Date.now()) {
      throw new PlatformAuthError("Your Vercel CLI session has expired.", LOGIN_HINT);
    }
    return auth.token;
  }

  throw new PlatformAuthError("No Vercel credentials found.", LOGIN_HINT);
}

export function parseVercelTargets(values: string[] | undefined): VercelTarget[] {
  const list = splitList(values).map((value) => value.toLowerCase());
  if (list.length === 0) return ["production"];

  const invalid = list.filter((value) => !VERCEL_TARGETS.includes(value as VercelTarget));
  if (invalid.length > 0) {
    throw new PushUsageError(
      `Invalid --vercel-target: ${invalid.join(", ")}`,
      "Use production, preview, or development (repeat the flag or separate with commas).",
    );
  }

  return VERCEL_TARGETS.filter((target) => list.includes(target));
}

function envTargets(env: VercelEnv): VercelTarget[] {
  if (!env.target) return [];
  return Array.isArray(env.target) ? env.target : [env.target];
}

function sameTargets(a: VercelTarget[], b: VercelTarget[]): boolean {
  return a.length === b.length && a.every((target) => b.includes(target));
}

async function resolveProject(
  options: PushOptions,
  deps: PushDeps,
): Promise<{ project: string; team?: string }> {
  if (options.vercelProject) {
    return { project: options.vercelProject, team: options.vercelTeam };
  }

  const content = await deps.readFile(join(deps.cwd, ".vercel", "project.json"));
  if (content) {
    try {
      const link = JSON.parse(content) as VercelProjectLink;
      if (link.projectId) {
        const linkedTeam = link.orgId?.startsWith("team_") ? link.orgId : undefined;
        return { project: link.projectId, team: options.vercelTeam ?? linkedTeam };
      }
    } catch {
      // fall through to the usage error below
    }
  }

  throw new PushUsageError(
    "No Vercel project found.",
    "Run `vercel link` in this directory, or pass --vercel-project <id-or-name>.",
  );
}

export class VercelAdapter implements PlatformAdapter {
  readonly id = "vercel" as const;
  readonly label = "Vercel";
  readonly destination: string;
  readonly productionLike: boolean;

  private entries: VercelEnv[] = [];

  constructor(
    private readonly deps: PushDeps,
    private readonly token: string,
    private readonly project: string,
    private readonly team: string | undefined,
    readonly targets: VercelTarget[],
  ) {
    this.destination = `${project} (${targets.join(", ")})`;
    this.productionLike = targets.includes("production");
  }

  get newVariableType(): "sensitive" | "encrypted" {
    // Vercel does not allow sensitive variables in the development target.
    return this.targets.includes("development") ? "encrypted" : "sensitive";
  }

  validate(secrets: Record<string, string>): string[] {
    return Object.keys(secrets)
      .filter((name) => !ENV_NAME_PATTERN.test(name))
      .map((name) => `${name}: Vercel names may only contain letters, digits, and underscores`);
  }

  async list(): Promise<RemoteSecret[]> {
    const response = await this.request<{ envs: VercelEnv[] }>(
      "GET",
      `/v10/projects/${encodeURIComponent(this.project)}/env`,
      undefined,
      { decrypt: "true" },
    );

    this.entries = response.envs.filter(
      (env) => !env.gitBranch && envTargets(env).some((target) => this.targets.includes(target)),
    );

    return this.entries.map((env) => {
      const comparable =
        sameTargets(envTargets(env), this.targets) &&
        (env.type === "plain" || (env.type === "encrypted" && env.decrypted === true)) &&
        typeof env.value === "string";
      return comparable ? { name: env.key, value: env.value } : { name: env.key };
    });
  }

  async upsert(secrets: Record<string, string>): Promise<void> {
    const failed: string[] = [];
    const creates: Array<{ key: string; value: string; type: string; target: VercelTarget[] }> = [];

    for (const [key, value] of Object.entries(secrets)) {
      const existing = this.entries.filter((env) => env.key === key);
      const exact = existing.find((env) => sameTargets(envTargets(env), this.targets));

      try {
        if (exact && existing.length === 1) {
          await this.request("PATCH", `${this.envPath()}/${exact.id}`, { value });
          continue;
        }
        for (const env of existing) {
          await this.detachTargets(env);
        }
        creates.push({ key, value, type: this.newVariableType, target: this.targets });
      } catch (err) {
        if (err instanceof PlatformAuthError) throw err;
        failed.push(key);
      }
    }

    if (creates.length > 0) {
      try {
        const result = await this.request<{ failed?: Array<{ error?: { key?: string } }> }>(
          "POST",
          `/v10/projects/${encodeURIComponent(this.project)}/env`,
          creates,
        );
        for (const failure of result.failed ?? []) {
          failed.push(failure.error?.key ?? "unknown");
        }
      } catch (err) {
        if (err instanceof PlatformAuthError) throw err;
        failed.push(...creates.map((create) => create.key));
      }
    }

    if (failed.length > 0) {
      throw new PushError(`Vercel rejected ${failed.length} variable(s): ${failed.join(", ")}`);
    }
  }

  async delete(names: string[]): Promise<void> {
    const failed: string[] = [];
    for (const name of names) {
      try {
        for (const env of this.entries.filter((entry) => entry.key === name)) {
          await this.detachTargets(env);
        }
      } catch (err) {
        if (err instanceof PlatformAuthError) throw err;
        failed.push(name);
      }
    }
    if (failed.length > 0) {
      throw new PushError(`Vercel failed to remove: ${failed.join(", ")}`);
    }
  }

  /** Removes our targets from an existing entry, deleting it when nothing else uses it. */
  private async detachTargets(env: VercelEnv): Promise<void> {
    const remaining = envTargets(env).filter((target) => !this.targets.includes(target));
    if (remaining.length === 0) {
      await this.request("DELETE", `${this.envPath()}/${env.id}`);
    } else {
      await this.request("PATCH", `${this.envPath()}/${env.id}`, { target: remaining });
    }
  }

  private envPath(): string {
    return `/v9/projects/${encodeURIComponent(this.project)}/env`;
  }

  private async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
    query: Record<string, string> = {},
  ): Promise<T> {
    const url = new URL(path, VERCEL_API);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    if (this.team) {
      url.searchParams.set(this.team.startsWith("team_") ? "teamId" : "slug", this.team);
    }

    const response = await this.deps.fetch(url.toString(), {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (!response.ok) {
      const parsed = (await response.json().catch(() => null)) as {
        error?: { message?: string; code?: string };
      } | null;
      const message = parsed?.error?.message ?? `HTTP ${response.status}`;

      if (response.status === 401) {
        throw new PlatformAuthError(`Vercel rejected the token: ${message}`, LOGIN_HINT);
      }
      if (response.status === 403) {
        throw new PlatformAuthError(
          `Vercel denied access to project ${this.project}: ${message}`,
          "Check --vercel-team, or run `vercel switch` / `vercel login` with an account that can edit this project.",
        );
      }
      if (response.status === 404 && method === "GET") {
        throw new PushUsageError(
          `Vercel project not found: ${this.project}`,
          "Check --vercel-project and --vercel-team, or run `vercel link`.",
        );
      }
      throw new PushError(`Vercel API error (${response.status}): ${message}`);
    }

    if (response.status === 204) return undefined as T;
    return (await response.json().catch(() => undefined)) as T;
  }
}

export const vercelAdapterFactory: AdapterFactory = {
  id: "vercel",
  label: "Vercel",
  aliases: ["vercel"],
  async create(options, deps) {
    const targets = parseVercelTargets(options.vercelTarget);
    const { project, team } = await resolveProject(options, deps);
    const token = await resolveVercelToken(deps);
    return new VercelAdapter(deps, token, project, team, targets);
  },
};
