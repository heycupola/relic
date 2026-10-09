import { join } from "node:path";
import { parse as parseToml } from "smol-toml";
import { isProductionLikeName } from "./plan";
import {
  type AdapterFactory,
  PlatformAuthError,
  type PlatformAdapter,
  PushError,
  type PushDeps,
  PushUsageError,
  type RemoteSecret,
} from "./types";
import { commandFailure, parseJsonOutput, resolveBinary, stripJsonComments } from "./util";

const CLOUDFLARE_API = "https://api.cloudflare.com/client/v4";
const WRANGLER_CONFIG_FILES = ["wrangler.json", "wrangler.jsonc", "wrangler.toml"] as const;
const BULK_LIMIT = 100;
const LOGIN_HINT =
  "Run `npx wrangler login`, or set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID.";

export interface WranglerConfig {
  name?: string;
  account_id?: string;
  env?: Record<string, { name?: string; account_id?: string } | undefined>;
}

export async function readWranglerConfig(
  deps: PushDeps,
): Promise<{ config: WranglerConfig; file: string } | null> {
  for (const file of WRANGLER_CONFIG_FILES) {
    const content = await deps.readFile(join(deps.cwd, file));
    if (content === null) continue;

    try {
      const config = file.endsWith(".toml")
        ? (parseToml(content) as WranglerConfig)
        : (JSON.parse(stripJsonComments(content)) as WranglerConfig);
      return { config, file };
    } catch (err) {
      throw new PushUsageError(
        `Could not parse ${file}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  return null;
}

/** Mirrors wrangler's legacy-environment naming: `<name>-<env>` unless the env sets its own name. */
export function resolveWorkerName(
  config: WranglerConfig | undefined,
  worker: string | undefined,
  wranglerEnv: string | undefined,
): string | undefined {
  if (worker) return wranglerEnv ? `${worker}-${wranglerEnv}` : worker;
  if (!config) return undefined;
  if (!wranglerEnv) return config.name;
  return (
    config.env?.[wranglerEnv]?.name ?? (config.name ? `${config.name}-${wranglerEnv}` : undefined)
  );
}

function isAuthFailure(output: string): boolean {
  return /not authenticated|wrangler login|CLOUDFLARE_API_TOKEN|Authentication error|\[code: 10000\]|\[code: 9109\]/i.test(
    output,
  );
}

function isWorkerMissing(output: string): boolean {
  return /\[code: 10007\]|worker does not exist/i.test(output);
}

abstract class CloudflareAdapterBase implements PlatformAdapter {
  readonly id = "cloudflare" as const;
  readonly label = "Cloudflare Workers";
  readonly productionLike: boolean;

  constructor(
    readonly destination: string,
    wranglerEnv: string | undefined,
  ) {
    this.productionLike = !wranglerEnv || isProductionLikeName(wranglerEnv);
  }

  abstract readonly mode: "wrangler" | "api";
  abstract list(): Promise<RemoteSecret[]>;
  abstract upsert(secrets: Record<string, string>): Promise<void>;
  abstract delete(names: string[]): Promise<void>;
}

export class WranglerCloudflareAdapter extends CloudflareAdapterBase {
  readonly mode = "wrangler" as const;

  constructor(
    private readonly deps: PushDeps,
    private readonly wrangler: string,
    workerName: string,
    private readonly worker: string | undefined,
    private readonly wranglerEnv: string | undefined,
  ) {
    super(workerName, wranglerEnv);
  }

  private flags(): string[] {
    const flags: string[] = [];
    if (this.worker) flags.push("--name", this.worker);
    if (this.wranglerEnv) flags.push("--env", this.wranglerEnv);
    return flags;
  }

  private async run(args: string[], input?: string) {
    return this.deps.exec(this.wrangler, args, { cwd: this.deps.cwd, input });
  }

  async list(): Promise<RemoteSecret[]> {
    let result = await this.run(["secret", "list", "--format", "json", ...this.flags()]);
    if (result.exitCode !== 0 && /unknown argument/i.test(result.stderr)) {
      result = await this.run(["secret", "list", ...this.flags()]);
    }

    if (result.exitCode !== 0) {
      const output = `${result.stderr}\n${result.stdout}`;
      if (isAuthFailure(output)) {
        throw new PlatformAuthError("Wrangler is not logged in to Cloudflare.", LOGIN_HINT);
      }
      if (isWorkerMissing(output)) return [];
      throw commandFailure("wrangler secret list failed", result.stderr, result.stdout);
    }

    try {
      const secrets = parseJsonOutput<Array<{ name: string }>>(result.stdout);
      return secrets.map((secret) => ({ name: secret.name }));
    } catch {
      throw new PushError("Could not parse `wrangler secret list` output.");
    }
  }

  async upsert(secrets: Record<string, string>): Promise<void> {
    const entries = Object.entries(secrets);
    for (let i = 0; i < entries.length; i += BULK_LIMIT) {
      const chunk = Object.fromEntries(entries.slice(i, i + BULK_LIMIT));
      const result = await this.run(["secret", "bulk", ...this.flags()], JSON.stringify(chunk));
      if (result.exitCode !== 0) {
        if (isAuthFailure(`${result.stderr}\n${result.stdout}`)) {
          throw new PlatformAuthError("Wrangler is not logged in to Cloudflare.", LOGIN_HINT);
        }
        throw commandFailure("wrangler secret bulk failed", result.stderr, result.stdout);
      }
    }
  }

  async delete(names: string[]): Promise<void> {
    const failed: string[] = [];
    for (const name of names) {
      const result = await this.run(["secret", "delete", name, ...this.flags()]);
      if (result.exitCode !== 0) failed.push(name);
    }
    if (failed.length > 0) {
      throw new PushError(`wrangler failed to delete: ${failed.join(", ")}`);
    }
  }
}

export class ApiCloudflareAdapter extends CloudflareAdapterBase {
  readonly mode = "api" as const;

  constructor(
    private readonly deps: PushDeps,
    private readonly token: string,
    private readonly accountId: string,
    private readonly workerName: string,
    wranglerEnv: string | undefined,
  ) {
    super(workerName, wranglerEnv);
  }

  private secretsPath(): string {
    return `/accounts/${encodeURIComponent(this.accountId)}/workers/scripts/${encodeURIComponent(this.workerName)}/secrets`;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<{
    status: number;
    data: { success?: boolean; result?: T; errors?: Array<{ code?: number; message?: string }> };
  }> {
    const response = await this.deps.fetch(`${CLOUDFLARE_API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = ((await response.json().catch(() => null)) ?? {}) as {
      success?: boolean;
      result?: T;
      errors?: Array<{ code?: number; message?: string }>;
    };

    if (
      response.status === 401 ||
      response.status === 403 ||
      data.errors?.some((e) => e.code === 10000)
    ) {
      throw new PlatformAuthError(
        "Cloudflare rejected CLOUDFLARE_API_TOKEN.",
        "Use an API token with the Workers Scripts: Edit permission for this account, or run `npx wrangler login`.",
      );
    }
    return { status: response.status, data };
  }

  private errorMessage(data: { errors?: Array<{ message?: string }> }, status: number): string {
    return (
      data.errors
        ?.map((e) => e.message)
        .filter(Boolean)
        .join("; ") || `HTTP ${status}`
    );
  }

  async list(): Promise<RemoteSecret[]> {
    const { status, data } = await this.request<Array<{ name: string }>>("GET", this.secretsPath());
    if (status === 404 || data.errors?.some((e) => e.code === 10007)) return [];
    if (!data.success) {
      throw new PushError(`Cloudflare API error: ${this.errorMessage(data, status)}`);
    }
    return (data.result ?? []).map((secret) => ({ name: secret.name }));
  }

  async upsert(secrets: Record<string, string>): Promise<void> {
    const failed: string[] = [];
    for (const [name, text] of Object.entries(secrets)) {
      const { status, data } = await this.request("PUT", this.secretsPath(), {
        name,
        text,
        type: "secret_text",
      });
      if (status === 404 || data.errors?.some((e) => e.code === 10007)) {
        throw new PushUsageError(
          `Worker "${this.workerName}" does not exist on this account.`,
          "Deploy it once with `npx wrangler deploy`, or check --worker and --wrangler-env.",
        );
      }
      if (!data.success) failed.push(name);
    }
    if (failed.length > 0) {
      throw new PushError(`Cloudflare rejected: ${failed.join(", ")}`);
    }
  }

  async delete(names: string[]): Promise<void> {
    const failed: string[] = [];
    for (const name of names) {
      const { data } = await this.request(
        "DELETE",
        `${this.secretsPath()}/${encodeURIComponent(name)}`,
      );
      if (!data.success) failed.push(name);
    }
    if (failed.length > 0) {
      throw new PushError(`Cloudflare failed to delete: ${failed.join(", ")}`);
    }
  }
}

export const cloudflareAdapterFactory: AdapterFactory = {
  id: "cloudflare",
  label: "Cloudflare Workers",
  aliases: ["cloudflare", "cf", "workers", "cloudflare-workers"],
  async create(options, deps) {
    const wranglerConfig = await readWranglerConfig(deps);
    const workerName = resolveWorkerName(
      wranglerConfig?.config,
      options.worker,
      options.wranglerEnv,
    );
    if (!workerName) {
      throw new PushUsageError(
        "No Worker name found.",
        "Pass --worker <name>, or run from a directory with wrangler.toml, wrangler.json, or wrangler.jsonc.",
      );
    }

    const wrangler = await resolveBinary(deps, ["wrangler"]);
    if (wrangler) {
      return new WranglerCloudflareAdapter(
        deps,
        wrangler,
        workerName,
        options.worker,
        options.wranglerEnv,
      );
    }

    const token = deps.env.CLOUDFLARE_API_TOKEN;
    const envConfig = options.wranglerEnv
      ? wranglerConfig?.config.env?.[options.wranglerEnv]
      : undefined;
    const accountId =
      deps.env.CLOUDFLARE_ACCOUNT_ID ?? envConfig?.account_id ?? wranglerConfig?.config.account_id;

    if (token && accountId) {
      return new ApiCloudflareAdapter(deps, token, accountId, workerName, options.wranglerEnv);
    }
    if (token) {
      throw new PlatformAuthError(
        "CLOUDFLARE_API_TOKEN is set but no account ID was found.",
        "Set CLOUDFLARE_ACCOUNT_ID, or add account_id to your wrangler config.",
      );
    }
    throw new PlatformAuthError(
      "No Cloudflare credentials found (wrangler is not installed and CLOUDFLARE_API_TOKEN is not set).",
      "Install wrangler (`npm i -D wrangler`) and run `npx wrangler login`, or set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID.",
    );
  },
};
