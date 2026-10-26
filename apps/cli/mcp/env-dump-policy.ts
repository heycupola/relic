import { findConfig } from "../lib/config";

/** Env var operators set when starting `relic mcp` (or in MCP client `env`). */
export const RELIC_MCP_ALLOW_DANGEROUS_ENV_DUMP = "RELIC_MCP_ALLOW_DANGEROUS_ENV_DUMP";

export function parseTruthyFlag(value: string | undefined | null): boolean {
  if (value == null) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export interface ResolveAllowDangerousEnvDumpOptions {
  /** `relic mcp --allow-dangerous-env-dump` */
  cliFlag?: boolean;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  /** When set, skips loading relic.toml (tests / callers with a preloaded config). */
  configAllow?: boolean | null;
  /** Override findConfig for tests. */
  loadConfigAllow?: () => Promise<boolean | null>;
}

/**
 * Operator-only opt-in for MCP env-dump commands. Defaults to false.
 * Precedence: CLI flag → env → relic.toml `[mcp] allow_dangerous_env_dump` → false.
 * Tool/model arguments must never control this.
 */
export async function resolveAllowDangerousEnvDump(
  options: ResolveAllowDangerousEnvDumpOptions = {},
): Promise<boolean> {
  if (options.cliFlag === true) return true;

  const env = options.env ?? process.env;
  if (parseTruthyFlag(env[RELIC_MCP_ALLOW_DANGEROUS_ENV_DUMP])) return true;

  if (options.configAllow === true) return true;
  if (options.configAllow === false) return false;

  if (options.loadConfigAllow) {
    return (await options.loadConfigAllow()) === true;
  }

  const found = await findConfig();
  return found?.config.mcp?.allow_dangerous_env_dump === true;
}
