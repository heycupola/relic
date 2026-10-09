import { ptr } from "bun:ffi";
import type { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import {
  cacheUserKeys,
  clearCachedUserKeys,
  getCachedUserKeys,
  getPasswordFromStorage,
  getUserKeyCacheDb,
  hasPassword,
  validateSession,
} from "@repo/auth";
import { createLogger, trackEvent } from "@repo/logger";
import ora, { type Ora } from "ora";
import pc from "picocolors";
import { RunnerBridge } from "../ffi/bridge";
import {
  cacheEnvironments,
  cacheFolders,
  cacheProject,
  cacheSecrets,
  getCacheDb,
  getCachedEnvironmentId,
  getCachedFolderId,
  getCachedSecrets,
  loadCachedEncryptedProjectKey,
  loadSecretsLastCachedTime,
} from "../helpers/cache";
import {
  exportSecretsViaApiKey,
  exportSecretsViaServiceToken,
  fetchUserKeysViaApiKey,
  getApi,
  ProPlanRequiredError,
  REQUEST_TIMEOUT_MS,
  type ProtectedApi,
  type SecretData,
} from "../lib/api";
import {
  failWithUpgradePrompt,
  getErrorMessage,
  NO_KEYS_MESSAGE,
  NO_PASSWORD_MESSAGE,
  NOT_LOGGED_IN_MESSAGE,
  PROJECT_ID_REQUIRED_MESSAGE,
  resolveProjectIdFromEnv,
  resolveProjectIdWithConfig,
} from "../lib/cli";
import { decryptSecrets, getProjectKey, ProjectKeyError } from "../lib/crypto";
import { buildChildEnv } from "../lib/env";
import { exitWithTelemetry } from "../lib/telemetry";
import type { SecretScope } from "../lib/types";

const log = createLogger("cli");

const SECRET_SCOPES: readonly SecretScope[] = ["client", "server", "shared"];
const COMMAND_NOT_FOUND_EXIT_CODE = 127;
const RUNNER_ERROR = -1;

export interface RunOptions {
  environment: string;
  folder?: string;
  scope?: SecretScope;
  project?: string;
  inheritEnv?: boolean;
}

export interface PrepareSecretsResult {
  secrets: Record<string, string>;
  count: number;
}

export interface UserKeys {
  encryptedPrivateKey: string;
  salt: string;
  fromCache: boolean;
}

function isServiceTokenMode(): boolean {
  return !!process.env.RELIC_SERVICE_TOKEN;
}

function isApiKeyMode(): boolean {
  return !!process.env.RELIC_API_KEY;
}

export type AuthMode = "service_token" | "api_key" | "session";

export function getAuthMode(): AuthMode {
  if (isServiceTokenMode()) return "service_token";
  if (isApiKeyMode()) return "api_key";
  return "session";
}

function isCiEnvironment(): boolean {
  return !!(
    process.env.CI ||
    process.env.GITHUB_ACTIONS ||
    process.env.GITLAB_CI ||
    process.env.CIRCLECI ||
    process.env.JENKINS_URL ||
    process.env.BUILDKITE
  );
}

export function injectedMessage(count: number): string {
  return `Injected ${count} secret${count !== 1 ? "s" : ""}`;
}

async function decryptToEnv(
  projectKey: CryptoKey,
  secrets: Array<{ key: string; encryptedValue: string }>,
): Promise<Record<string, string>> {
  const decryptedSecrets = await decryptSecrets(
    projectKey,
    secrets.map((s) => ({ key: s.key, encryptedValue: s.encryptedValue })),
  );

  const env: Record<string, string> = {};
  for (const secret of decryptedSecrets) {
    env[secret.key] = secret.value;
  }
  return env;
}

function readCachedUserKeys(userKeyDb: Database): UserKeys | null {
  const cachedKeys = getCachedUserKeys(userKeyDb);
  if (!cachedKeys) return null;
  return {
    encryptedPrivateKey: cachedKeys.encryptedPrivateKey,
    salt: cachedKeys.salt,
    fromCache: true,
  };
}

async function fetchAndCacheUserKeysViaApiKey(
  userKeyDb: Database,
  apiKey: string,
): Promise<UserKeys> {
  const keys = await fetchUserKeysViaApiKey(apiKey);

  cacheUserKeys(userKeyDb, {
    encryptedPrivateKey: keys.encryptedPrivateKey,
    salt: keys.salt,
    publicKey: keys.publicKey,
    keysUpdatedAt: Date.now(),
  });

  return { encryptedPrivateKey: keys.encryptedPrivateKey, salt: keys.salt, fromCache: false };
}

export async function prepareSecretsWithApiKey(
  projectId: string,
  options: RunOptions,
): Promise<PrepareSecretsResult> {
  const apiKey = process.env.RELIC_API_KEY;
  if (!apiKey) {
    throw new Error("RELIC_API_KEY is required for API key mode.");
  }

  const password = await getPasswordFromStorage();
  if (!password) {
    throw new Error("RELIC_PASSWORD is required for API key mode.");
  }

  const userKeyDb = await getUserKeyCacheDb();
  const userKeys =
    readCachedUserKeys(userKeyDb) ?? (await fetchAndCacheUserKeysViaApiKey(userKeyDb, apiKey));

  const result = await exportSecretsViaApiKey(apiKey, {
    projectId,
    environmentName: options.environment,
    folderName: options.folder,
    scope: options.scope,
  });

  if (result.count === 0) {
    throw new Error("No secrets found");
  }

  const { unwrapProjectKey } = await import("@repo/crypto");
  const unwrap = (keys: UserKeys) =>
    unwrapProjectKey(result.encryptedProjectKey, keys.encryptedPrivateKey, password, keys.salt);

  let projectKey: CryptoKey;
  try {
    projectKey = await unwrap(userKeys);
  } catch (err) {
    if (!userKeys.fromCache) {
      throw err;
    }

    clearCachedUserKeys(userKeyDb);
    projectKey = await unwrap(await fetchAndCacheUserKeysViaApiKey(userKeyDb, apiKey));
  }

  return { secrets: await decryptToEnv(projectKey, result.secrets), count: result.count };
}

async function resolveOidcToken(): Promise<string | undefined> {
  if (process.env.RELIC_OIDC_TOKEN) {
    return process.env.RELIC_OIDC_TOKEN;
  }

  const requestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const requestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (requestUrl && requestToken) {
    try {
      const response = await fetch(`${requestUrl}&audience=relic`, {
        headers: { Authorization: `bearer ${requestToken}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (response.ok) {
        const data = (await response.json()) as { value?: string };
        return data.value;
      }
    } catch {
      log.warn("Failed to request GitHub Actions OIDC token");
    }
  }

  // Legacy GitLab (< 17.0) predefined token; newer GitLab requires `id_tokens: RELIC_OIDC_TOKEN`.
  if (process.env.CI_JOB_JWT_V2) {
    return process.env.CI_JOB_JWT_V2;
  }

  return undefined;
}

export async function prepareSecretsWithServiceToken(
  options: RunOptions,
): Promise<PrepareSecretsResult> {
  const serviceToken = process.env.RELIC_SERVICE_TOKEN;
  if (!serviceToken) {
    throw new Error("RELIC_SERVICE_TOKEN is required for service token mode.");
  }

  const oidcToken = await resolveOidcToken();

  const result = await exportSecretsViaServiceToken(
    serviceToken,
    {
      environmentName: options.environment,
      folderName: options.folder,
      scope: options.scope,
    },
    oidcToken,
  );

  if (result.count === 0) {
    throw new Error("No secrets found");
  }

  const { unwrapProjectKeyWithServiceToken } = await import("@repo/crypto");
  const projectKey = await unwrapProjectKeyWithServiceToken(
    result.encryptedProjectKey,
    result.encryptedPrivateKey,
    serviceToken,
    result.salt,
  );

  return { secrets: await decryptToEnv(projectKey, result.secrets), count: result.count };
}

export async function resolveUserKeys(userKeyDb: Database, api: ProtectedApi): Promise<UserKeys> {
  return readCachedUserKeys(userKeyDb) ?? (await fetchAndCacheUserKeys(userKeyDb, api));
}

async function fetchAndCacheUserKeys(userKeyDb: Database, api: ProtectedApi): Promise<UserKeys> {
  const user = await api.getFullUser();
  if (!user.encryptedPrivateKey || !user.salt) {
    throw new Error(NO_KEYS_MESSAGE);
  }

  cacheUserKeys(userKeyDb, {
    encryptedPrivateKey: user.encryptedPrivateKey,
    salt: user.salt,
    keysUpdatedAt: user.keysUpdatedAt ?? Date.now(),
  });

  return { encryptedPrivateKey: user.encryptedPrivateKey, salt: user.salt, fromCache: false };
}

function loadValidCachedSecrets(
  db: Database,
  projectId: string,
  options: RunOptions,
  environmentId: string,
  folderId: string | undefined,
): { secrets: SecretData[]; encryptedProjectKey: string } | null {
  const cachedSecrets = getCachedSecrets(db, projectId, environmentId, folderId, options.scope);
  const cachedProjectKey = loadCachedEncryptedProjectKey(db, projectId);
  if (cachedSecrets && cachedProjectKey) {
    return { secrets: cachedSecrets, encryptedProjectKey: cachedProjectKey };
  }
  return null;
}

async function resolveSecrets(
  db: Database,
  projectId: string,
  options: RunOptions,
  api: ProtectedApi,
): Promise<{ secrets: SecretData[]; encryptedProjectKey: string }> {
  const cachedEnvironmentId = getCachedEnvironmentId(db, projectId, options.environment);

  if (cachedEnvironmentId) {
    const cachedFolderId = options.folder
      ? (getCachedFolderId(db, projectId, cachedEnvironmentId, options.folder) ?? undefined)
      : undefined;
    const isCached = options.folder ? !!cachedFolderId : true;

    const lastCachedAt = isCached
      ? loadSecretsLastCachedTime(db, projectId, cachedEnvironmentId, cachedFolderId)
      : null;

    if (lastCachedAt) {
      const validation = await api.getSecretsCacheValidation(
        projectId,
        cachedEnvironmentId,
        cachedFolderId,
      );

      if (validation?.updatedAt && lastCachedAt >= validation.updatedAt) {
        const cached = loadValidCachedSecrets(
          db,
          projectId,
          options,
          cachedEnvironmentId,
          cachedFolderId,
        );
        if (cached) return cached;
      }
    }
  }

  const result = await api.exportSecrets({
    projectId,
    environmentName: options.environment,
    folderName: options.folder,
  });

  if (result.count === 0) {
    throw new Error("No secrets found");
  }

  cacheProject(db, projectId, result.encryptedProjectKey);
  cacheEnvironments(db, projectId, [{ id: result.environmentId, name: options.environment }]);
  if (result.folderId && options.folder) {
    cacheFolders(db, projectId, [
      { id: result.folderId, environmentId: result.environmentId, name: options.folder },
    ]);
  }
  cacheSecrets(
    db,
    projectId,
    result.environmentId,
    result.folderId ?? undefined,
    result.secrets,
    Date.now(),
  );

  const secrets = options.scope
    ? result.secrets.filter((s) => s.scope === options.scope)
    : result.secrets;

  return { secrets, encryptedProjectKey: result.encryptedProjectKey };
}

export async function resolveProjectKey(
  encryptedProjectKey: string,
  userKeys: UserKeys,
  userKeyDb: Database,
  api: ProtectedApi,
): Promise<CryptoKey> {
  try {
    return await getProjectKey(encryptedProjectKey, userKeys.encryptedPrivateKey, userKeys.salt);
  } catch (err) {
    const isDecryptionFailure = err instanceof ProjectKeyError && err.code === "DECRYPTION_FAILED";
    if (!userKeys.fromCache || !isDecryptionFailure) {
      throw err;
    }

    clearCachedUserKeys(userKeyDb);
    const freshKeys = await fetchAndCacheUserKeys(userKeyDb, api);
    return await getProjectKey(encryptedProjectKey, freshKeys.encryptedPrivateKey, freshKeys.salt);
  }
}

export async function prepareSecrets(
  projectId: string,
  options: RunOptions,
  db: Database,
  userKeyDb: Database,
  api: ProtectedApi,
): Promise<PrepareSecretsResult> {
  const userKeys = readCachedUserKeys(userKeyDb) ?? (await fetchAndCacheUserKeys(userKeyDb, api));
  const { secrets, encryptedProjectKey } = await resolveSecrets(db, projectId, options, api);
  const projectKey = await resolveProjectKey(encryptedProjectKey, userKeys, userKeyDb, api);

  return { secrets: await decryptToEnv(projectKey, secrets), count: secrets.length };
}

export function resolveProjectId(options: RunOptions): string | null {
  return resolveProjectIdFromEnv(options.project);
}

async function prepareWithServiceToken(
  spinner: Ora,
  options: RunOptions,
): Promise<PrepareSecretsResult> {
  if (options.project) {
    console.error(
      pc.yellow(
        "  ⚠ `--project` is ignored with RELIC_SERVICE_TOKEN: service accounts are bound to one project.\n",
      ),
    );
  }

  spinner.start("Authenticating with service token...");
  spinner.text = "Fetching secrets via service token...";
  return prepareSecretsWithServiceToken(options);
}

async function prepareWithApiKey(spinner: Ora, options: RunOptions): Promise<PrepareSecretsResult> {
  if (isCiEnvironment()) {
    console.error(
      pc.yellow(
        "  ⚠ Using RELIC_API_KEY + RELIC_PASSWORD in CI is deprecated.\n" +
          "    Use RELIC_SERVICE_TOKEN with OIDC trust policies instead.\n" +
          "    See: https://docs.withrelic.com/guides/oidc\n",
      ),
    );
  }

  spinner.start("Authenticating with API key...");

  const projectId = await resolveProjectIdWithConfig(options.project);
  if (!projectId) {
    throw new Error(PROJECT_ID_REQUIRED_MESSAGE);
  }

  spinner.text = "Fetching secrets via API key...";
  return prepareSecretsWithApiKey(projectId, options);
}

async function prepareWithSession(
  spinner: Ora,
  options: RunOptions,
): Promise<PrepareSecretsResult> {
  spinner.start("Checking authentication...");

  const sessionValidation = await validateSession();
  if (!sessionValidation.isValid || sessionValidation.isExpired) {
    throw new Error(NOT_LOGGED_IN_MESSAGE);
  }

  spinner.text = "Verifying password...";
  if (!(await hasPassword())) {
    throw new Error(NO_PASSWORD_MESSAGE);
  }

  if (!(await getPasswordFromStorage())) {
    throw new Error("Could not retrieve password. Run `relic login` to re-authenticate.");
  }

  spinner.text = "Loading configuration...";
  const projectId = await resolveProjectIdWithConfig(options.project);
  if (!projectId) {
    throw new Error(PROJECT_ID_REQUIRED_MESSAGE);
  }

  spinner.text = "Preparing secrets...";
  const db = await getCacheDb(projectId);
  const userKeyDb = await getUserKeyCacheDb();
  return prepareSecrets(projectId, options, db, userKeyDb, getApi());
}

export function loadSecrets(
  spinner: Ora,
  options: RunOptions,
  mode: AuthMode,
): Promise<PrepareSecretsResult> {
  switch (mode) {
    case "service_token":
      return prepareWithServiceToken(spinner, options);
    case "api_key":
      return prepareWithApiKey(spinner, options);
    case "session":
      return prepareWithSession(spinner, options);
  }
}

/** Exits with 1 when `--environment` is missing or `--scope` is invalid; normalizes the scope. */
export async function validateRunOptions(options: RunOptions): Promise<void> {
  if (!options.environment) {
    console.error(pc.red("Error: -e, --environment is required"));
    await exitWithTelemetry(1);
  }

  if (options.scope) {
    const scope = options.scope.toLowerCase() as SecretScope;
    if (!SECRET_SCOPES.includes(scope)) {
      console.error(pc.red("Error: --scope must be: client, server, or shared"));
      await exitWithTelemetry(1);
    }
    options.scope = scope;
  }
}

export async function failRun(spinner: Ora, err: unknown): Promise<never> {
  if (err instanceof ProPlanRequiredError) {
    await failWithUpgradePrompt(spinner, err.message, err.upgradeUrl);
  }

  spinner.fail(pc.red(getErrorMessage(err)));
  return exitWithTelemetry(1);
}

/** Resolves like the runner does: the child's PATH (secrets may override it) or a direct path. */
export function commandExists(program: string, path: string | undefined): boolean {
  if (program.includes("/") || program.includes("\\")) {
    return existsSync(program);
  }
  return Bun.which(program, { PATH: path ?? "" }) !== null;
}

/**
 * The runner exits with the child's code, 128+N for signal N, or -1 when it could not start the
 * command; -1 is reported as 127 (the shell convention for "command not found").
 */
export function toProcessExitCode(runnerExitCode: number): number {
  return runnerExitCode === RUNNER_ERROR ? COMMAND_NOT_FOUND_EXIT_CODE : runnerExitCode;
}

/** Runs `command` through the runner with `childEnv`; returns the process exit code. */
export async function runWithEnv(
  command: string[],
  childEnv: Record<string, string>,
): Promise<number> {
  const runner = await RunnerBridge.getInstance();

  const commandBuffer = Buffer.from(`${JSON.stringify(command)}\0`, "utf-8");
  const secretsBuffer = Buffer.from(`${JSON.stringify(childEnv)}\0`, "utf-8");

  let exitCode = RUNNER_ERROR;
  try {
    exitCode = runner.runWithSecrets(ptr(commandBuffer), ptr(secretsBuffer));
  } finally {
    commandBuffer.fill(0);
    secretsBuffer.fill(0);
  }

  if (exitCode === RUNNER_ERROR) {
    console.error(pc.red(`✖ Failed to start \`${command[0]}\``));
  }
  return toProcessExitCode(exitCode);
}

async function executeCommand(
  command: string[],
  childEnv: Record<string, string>,
  count: number,
  startTime: number,
): Promise<never> {
  const processExitCode = await runWithEnv(command, childEnv);

  trackEvent("cli_run_completed", {
    secret_count: count,
    exit_code: processExitCode,
    duration_ms: Date.now() - startTime,
  });

  return exitWithTelemetry(processExitCode);
}

export default async function run(command: string[], options: RunOptions) {
  await validateRunOptions(options);

  if (command.length === 0) {
    console.error(pc.red("Error: No command specified"));
    await exitWithTelemetry(1);
  }

  const mode = getAuthMode();
  const startTime = Date.now();
  trackEvent("cli_run_started", {
    has_folder: !!options.folder,
    has_scope: !!options.scope,
    inherit_env: !!options.inheritEnv,
    mode,
  });

  const spinner = ora();

  try {
    const { secrets, count } = await loadSecrets(spinner, options, mode);

    const childEnv = options.inheritEnv ? buildChildEnv(process.env, secrets) : secrets;
    const program = command[0]!;
    if (!commandExists(program, childEnv.PATH ?? process.env.PATH)) {
      spinner.fail(pc.red(`command not found: ${program}`));
      trackEvent("cli_run_completed", {
        success: false,
        exit_code: COMMAND_NOT_FOUND_EXIT_CODE,
        duration_ms: Date.now() - startTime,
      });
      await exitWithTelemetry(COMMAND_NOT_FOUND_EXIT_CODE);
    }

    spinner.succeed(pc.green(injectedMessage(count)));
    await executeCommand(command, childEnv, count, startTime);
  } catch (err) {
    log.error("Run failed", err);
    trackEvent("cli_run_completed", { success: false, duration_ms: Date.now() - startTime });
    await failRun(spinner, err);
  }
}
