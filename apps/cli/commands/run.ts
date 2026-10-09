import { ptr } from "bun:ffi";
import type { Database } from "bun:sqlite";
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
  type ProtectedApi,
  type SecretData,
} from "../lib/api";
import {
  failWithUpgradePrompt,
  getErrorMessage,
  NO_PASSWORD_MESSAGE,
  NOT_LOGGED_IN_MESSAGE,
  PROJECT_ID_REQUIRED_MESSAGE,
  resolveProjectIdFromEnv,
  resolveProjectIdWithConfig,
} from "../lib/cli";
import { findConfig } from "../lib/config";
import { decryptSecrets, getProjectKey, ProjectKeyError } from "../lib/crypto";
import type { SecretScope } from "../lib/types";

const log = createLogger("cli");

const SECRET_SCOPES: readonly SecretScope[] = ["client", "server", "shared"];
const NO_KEYS_MESSAGE = "No encryption keys found. Run 'relic' to set up your keys first.";

export interface RunOptions {
  environment: string;
  folder?: string;
  scope?: SecretScope;
  project?: string;
}

export interface PrepareSecretsResult {
  secrets: Record<string, string>;
  count: number;
}

interface UserKeys {
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

function injectedMessage(count: number): string {
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
      });
      if (response.ok) {
        const data = (await response.json()) as { value?: string };
        return data.value;
      }
    } catch {
      log.warn("Failed to request GitHub Actions OIDC token");
    }
  }

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

async function resolveProjectKey(
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

function failAndExit(spinner: Ora, message: string): never {
  spinner.fail(pc.red(message));
  process.exit(1);
}

async function prepareWithServiceToken(
  spinner: Ora,
  options: RunOptions,
): Promise<PrepareSecretsResult> {
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
    failAndExit(spinner, PROJECT_ID_REQUIRED_MESSAGE);
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
    failAndExit(spinner, NOT_LOGGED_IN_MESSAGE);
  }

  spinner.text = "Verifying password...";
  if (!(await hasPassword())) {
    failAndExit(spinner, NO_PASSWORD_MESSAGE);
  }

  if (!(await getPasswordFromStorage())) {
    failAndExit(spinner, "Could not retrieve password. Please re-authenticate.");
  }

  spinner.text = "Loading configuration...";
  const configResult = await findConfig();
  if (!configResult) {
    failAndExit(spinner, "No relic.toml found. Run 'relic init' first.");
  }

  const projectId = resolveProjectId(options) ?? configResult.config.project_id;

  spinner.text = "Preparing secrets...";
  const db = await getCacheDb();
  const userKeyDb = await getUserKeyCacheDb();
  return prepareSecrets(projectId, options, db, userKeyDb, getApi());
}

async function executeCommand(
  command: string[],
  secrets: Record<string, string>,
  count: number,
  startTime: number,
): Promise<never> {
  const runner = await RunnerBridge.getInstance();

  const commandBuffer = Buffer.from(`${JSON.stringify(command)}\0`, "utf-8");
  const secretsBuffer = Buffer.from(`${JSON.stringify(secrets)}\0`, "utf-8");

  let exitCode = -1;
  try {
    exitCode = runner.runWithSecrets(ptr(commandBuffer), ptr(secretsBuffer));
  } finally {
    commandBuffer.fill(0);
    secretsBuffer.fill(0);
  }

  trackEvent("cli_run_completed", {
    secret_count: count,
    exit_code: exitCode,
    duration_ms: Date.now() - startTime,
  });

  process.exit(exitCode);
}

export default async function run(command: string[], options: RunOptions) {
  if (!options.environment) {
    console.error(pc.red("Error: --env is required"));
    process.exit(1);
  }

  if (command.length === 0) {
    console.error(pc.red("Error: No command specified"));
    process.exit(1);
  }

  if (options.scope) {
    const scope = options.scope.toLowerCase() as SecretScope;
    if (!SECRET_SCOPES.includes(scope)) {
      console.error(pc.red("Error: --scope must be: client, server, or shared"));
      process.exit(1);
    }
    options.scope = scope;
  }

  const mode = isServiceTokenMode() ? "service_token" : isApiKeyMode() ? "api_key" : "session";
  const startTime = Date.now();
  trackEvent("cli_run_started", {
    has_folder: !!options.folder,
    has_scope: !!options.scope,
    mode,
  });

  const spinner = ora();

  try {
    const { secrets, count } =
      mode === "service_token"
        ? await prepareWithServiceToken(spinner, options)
        : mode === "api_key"
          ? await prepareWithApiKey(spinner, options)
          : await prepareWithSession(spinner, options);

    spinner.succeed(pc.green(injectedMessage(count)));
    await executeCommand(command, secrets, count, startTime);
  } catch (err) {
    log.error("Run failed", err);
    trackEvent("cli_run_completed", { success: false, duration_ms: Date.now() - startTime });

    if (err instanceof ProPlanRequiredError) {
      await failWithUpgradePrompt(spinner, err.message, err.upgradeUrl);
    }

    failAndExit(spinner, getErrorMessage(err));
  }
}
