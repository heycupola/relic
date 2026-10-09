import { trackEvent } from "@repo/logger";
import ora from "ora";
import pc from "picocolors";
import {
  getApi,
  listSecretNamesViaApiKey,
  listSecretNamesViaServiceToken,
  ProPlanRequiredError,
  type SecretNamesRequest,
} from "../lib/api";
import {
  buildCheckReport,
  type CheckReport,
  collectRequiredKeys,
  formatCheckReport,
  readCheckIgnore,
} from "../lib/check";
import { findConfig } from "../lib/config";
import {
  hasActiveSession,
  NOT_LOGGED_IN_MESSAGE,
  PROJECT_ID_REQUIRED_MESSAGE,
  parseConvexError,
  resolveProjectIdFromEnv,
} from "../lib/cli";
import { compileIgnore } from "../lib/env-keys";
import { resolveOidcToken } from "../lib/oidc";
import { exitWithTelemetry } from "../lib/telemetry";
import type { SecretScope } from "../lib/types";
import type { AuthMode } from "./run";

export interface CheckOptions {
  environment: string;
  folder?: string;
  scope?: SecretScope;
  project?: string;
  from?: string[];
  scan?: boolean | string[];
  ignore?: string[];
  compare?: string;
  strict?: boolean;
  json?: boolean;
}

async function createNameFetcher(
  options: CheckOptions,
  configProjectId: string | undefined,
): Promise<{ mode: AuthMode; fetchNames: (environmentName: string) => Promise<string[]> }> {
  const request = (environmentName: string): SecretNamesRequest => ({
    environmentName,
    folderName: options.folder,
    scope: options.scope,
  });

  const serviceToken = process.env.RELIC_SERVICE_TOKEN;
  if (serviceToken) {
    const oidcToken = await resolveOidcToken();
    return {
      mode: "service_token",
      fetchNames: async (environmentName) => {
        const result = await listSecretNamesViaServiceToken(
          serviceToken,
          request(environmentName),
          oidcToken,
        );
        return result.secrets.map((s) => s.key);
      },
    };
  }

  const projectId = resolveProjectIdFromEnv(options.project) ?? configProjectId;
  if (!projectId) {
    throw new Error(PROJECT_ID_REQUIRED_MESSAGE);
  }

  const apiKey = process.env.RELIC_API_KEY;
  if (apiKey) {
    return {
      mode: "api_key",
      fetchNames: async (environmentName) => {
        const result = await listSecretNamesViaApiKey(apiKey, {
          projectId,
          ...request(environmentName),
        });
        return result.secrets.map((s) => s.key);
      },
    };
  }

  if (!(await hasActiveSession())) {
    throw new Error(NOT_LOGGED_IN_MESSAGE);
  }

  const api = getApi();
  return {
    mode: "session",
    fetchNames: async (environmentName) => {
      const result = await api.listSecretNames({ projectId, ...request(environmentName) });
      return result.secrets.map((s) => s.key);
    },
  };
}

async function runCheck(
  options: CheckOptions,
  spinner: ReturnType<typeof ora> | null,
): Promise<{ report: CheckReport; mode: AuthMode }> {
  const configResult = await findConfig();
  const rootDir = configResult?.rootDir ?? process.cwd();

  const isIgnored = compileIgnore([
    ...readCheckIgnore(configResult?.config),
    ...(options.ignore ?? []).flatMap((value) => value.split(",")),
  ]);

  if (spinner) spinner.text = "Collecting required keys...";
  const collected = await collectRequiredKeys({
    rootDir,
    from: options.from,
    scan: options.scan === true ? [] : options.scan || undefined,
  });
  const required = collected.sources.length > 0 ? collected : null;

  if (!required && !options.compare) {
    throw new Error(
      "No required keys found. Add a .env.example next to relic.toml, or use --from, --scan, or --compare.",
    );
  }

  if (spinner) spinner.text = "Fetching secret names...";
  const { mode, fetchNames } = await createNameFetcher(options, configResult?.config.project_id);
  const [available, compareAvailable] = await Promise.all([
    fetchNames(options.environment),
    options.compare ? fetchNames(options.compare) : Promise.resolve(null),
  ]);

  const report = buildCheckReport({
    environment: options.environment,
    folder: options.folder,
    scope: options.scope,
    strict: options.strict,
    required,
    available,
    compare:
      options.compare && compareAvailable
        ? { environment: options.compare, available: compareAvailable }
        : null,
    isIgnored,
  });

  return { report, mode };
}

async function exitWithError(options: CheckOptions, message: string): Promise<never> {
  if (options.json) {
    console.log(JSON.stringify({ ok: false, error: message }, null, 2));
  } else {
    console.error(pc.red(`Error: ${message}`));
  }
  return exitWithTelemetry(1);
}

export default async function check(options: CheckOptions) {
  if (!options.environment) {
    await exitWithError(options, "--environment is required");
  }

  if (options.scope && !["client", "server", "shared"].includes(options.scope.toLowerCase())) {
    await exitWithError(options, "--scope must be: client, server, or shared");
  }
  if (options.scope) {
    options.scope = options.scope.toLowerCase() as SecretScope;
  }

  if (options.compare && options.compare.toLowerCase() === options.environment.toLowerCase()) {
    await exitWithError(options, "--compare must name a different environment");
  }

  const startTime = Date.now();
  const spinner = options.json ? null : ora("Loading configuration...").start();

  let result: { report: CheckReport; mode: AuthMode };
  try {
    result = await runCheck(options, spinner);
  } catch (err) {
    trackEvent("cli_check_completed", { success: false, duration_ms: Date.now() - startTime });

    const message = parseConvexError(err).message;
    if (options.json) {
      return exitWithError(options, message);
    }

    spinner?.fail(pc.red(message));
    if (err instanceof ProPlanRequiredError) {
      console.error(pc.dim("  Upgrade at: ") + pc.underline(err.upgradeUrl));
    }
    return exitWithTelemetry(1);
  }

  spinner?.stop();
  const { report, mode } = result;

  trackEvent("cli_check_completed", {
    success: true,
    ok: report.ok,
    mode,
    strict: report.strict,
    has_folder: !!options.folder,
    has_scope: !!options.scope,
    has_scan: !!options.scan,
    has_compare: !!options.compare,
    required_count: report.required?.total ?? 0,
    missing_count: report.required?.missing.length ?? 0,
    unused_count: report.required?.unused.length ?? 0,
    duration_ms: Date.now() - startTime,
  });

  console.log(options.json ? JSON.stringify(report, null, 2) : formatCheckReport(report));
  await exitWithTelemetry(report.ok ? 0 : 1);
}
