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
} from "helpers/cache";
import type { SecretScope } from "lib/types";
import ora from "ora";
import pc from "picocolors";
import { RunnerBridge } from "../ffi/bridge";
import {
  exportSecretsViaApiKey,
  fetchUserKeysViaApiKey,
  getApi,
  type ProtectedApi,
  type SecretData,
} from "../lib/api";
import { findConfig } from "../lib/config";
import { decryptSecrets, getProjectKey, ProjectKeyError } from "../lib/crypto";

const log = createLogger("cli");

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

function isApiKeyMode(): boolean {
  return !!process.env.RELIC_API_KEY;
}

async function resolveUserKeysWithApiKey(
  userKeyDb: Database,
  apiKey: string,
): Promise<{ encryptedPrivateKey: string; salt: string; fromCache: boolean }> {
  const cachedKeys = getCachedUserKeys(userKeyDb);
  if (cachedKeys) {
    return {
      encryptedPrivateKey: cachedKeys.encryptedPrivateKey,
      salt: cachedKeys.salt,
      fromCache: true,
    };
  }

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
  const userKeys = await resolveUserKeysWithApiKey(userKeyDb, apiKey);

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
  let projectKey: CryptoKey;
  try {
    projectKey = await unwrapProjectKey(
      result.encryptedProjectKey,
      userKeys.encryptedPrivateKey,
      password,
      userKeys.salt,
    );
  } catch (err) {
    if (!userKeys.fromCache) {
      throw err;
    }

    clearCachedUserKeys(userKeyDb);
    const freshKeys = await fetchUserKeysViaApiKey(apiKey);
    cacheUserKeys(userKeyDb, {
      encryptedPrivateKey: freshKeys.encryptedPrivateKey,
      salt: freshKeys.salt,
      publicKey: freshKeys.publicKey,
      keysUpdatedAt: Date.now(),
    });

    projectKey = await unwrapProjectKey(
      result.encryptedProjectKey,
      freshKeys.encryptedPrivateKey,
      password,
      freshKeys.salt,
    );
  }

  const decryptedSecrets = await decryptSecrets(
    projectKey,
    result.secrets.map((s) => ({ key: s.key, encryptedValue: s.encryptedValue })),
  );

  const secretsObj: Record<string, string> = {};
  for (const secret of decryptedSecrets) {
    secretsObj[secret.key] = secret.value;
  }

  return { secrets: secretsObj, count: result.count };
}

async function resolveUserKeys(
  userKeyDb: Database,
  api: ProtectedApi,
): Promise<{ encryptedPrivateKey: string; salt: string; fromCache: boolean }> {
  const cachedKeys = getCachedUserKeys(userKeyDb);

  if (cachedKeys) {
    return {
      encryptedPrivateKey: cachedKeys.encryptedPrivateKey,
      salt: cachedKeys.salt,
      fromCache: true,
    };
  }

  const user = await api.getFullUser();
  if (!user.encryptedPrivateKey || !user.salt) {
    throw new Error("No encryption keys found. Run 'relic tui' to set up your keys first.");
  }

  cacheUserKeys(userKeyDb, {
    encryptedPrivateKey: user.encryptedPrivateKey,
    salt: user.salt,
    keysUpdatedAt: user.keysUpdatedAt ?? Date.now(),
  });

  return {
    encryptedPrivateKey: user.encryptedPrivateKey,
    salt: user.salt,
    fromCache: false,
  };
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
      ? getCachedFolderId(db, projectId, cachedEnvironmentId, options.folder)
      : null;

    const isCached = options.folder ? !!cachedFolderId : true;

    const lastCachedAt = isCached
      ? loadSecretsLastCachedTime(db, projectId, cachedEnvironmentId, cachedFolderId ?? undefined)
      : null;

    let lastUpdatedAt: number | null = null;

    if (lastCachedAt !== null) {
      const secretsCacheValidation = await api.getSecretsCacheValidation(
        projectId,
        cachedEnvironmentId,
        cachedFolderId ?? undefined,
      );
      if (secretsCacheValidation) {
        lastUpdatedAt = secretsCacheValidation.updatedAt;
      }
    }

    const cacheIsValid = isCached && lastCachedAt && lastUpdatedAt && lastCachedAt >= lastUpdatedAt;

    if (cacheIsValid) {
      const cachedSecrets = getCachedSecrets(
        db,
        projectId,
        cachedEnvironmentId,
        cachedFolderId ?? undefined,
        options.scope,
      );
      const cachedProjectKey = loadCachedEncryptedProjectKey(db, projectId);

      if (cachedSecrets && cachedProjectKey) {
        return { secrets: cachedSecrets, encryptedProjectKey: cachedProjectKey };
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
  userEncryptedPrivateKey: string,
  userSalt: string,
  fromCache: boolean,
  userKeyDb: Database,
  api: ProtectedApi,
): Promise<CryptoKey> {
  try {
    return await getProjectKey(encryptedProjectKey, userEncryptedPrivateKey, userSalt);
  } catch (err) {
    const isDecryptionFailure = err instanceof ProjectKeyError && err.code === "DECRYPTION_FAILED";

    if (fromCache && isDecryptionFailure) {
      clearCachedUserKeys(userKeyDb);

      const freshUser = await api.getFullUser();
      if (!freshUser.encryptedPrivateKey || !freshUser.salt) {
        throw new Error("No encryption keys found. Run 'relic tui' to set up your keys first.");
      }

      cacheUserKeys(userKeyDb, {
        encryptedPrivateKey: freshUser.encryptedPrivateKey,
        salt: freshUser.salt,
        keysUpdatedAt: freshUser.keysUpdatedAt ?? Date.now(),
      });

      return await getProjectKey(
        encryptedProjectKey,
        freshUser.encryptedPrivateKey,
        freshUser.salt,
      );
    }

    throw err;
  }
}

export async function prepareSecrets(
  projectId: string,
  options: RunOptions,
  db: Database,
  userKeyDb: Database,
  api: ProtectedApi,
): Promise<PrepareSecretsResult> {
  const userKeys = await resolveUserKeys(userKeyDb, api);

  const { secrets, encryptedProjectKey } = await resolveSecrets(db, projectId, options, api);

  const projectKey = await resolveProjectKey(
    encryptedProjectKey,
    userKeys.encryptedPrivateKey,
    userKeys.salt,
    userKeys.fromCache,
    userKeyDb,
    api,
  );

  const decryptedSecrets = await decryptSecrets(
    projectKey,
    secrets.map((s) => ({ key: s.key, encryptedValue: s.encryptedValue })),
  );

  const secretsObj: Record<string, string> = {};
  for (const secret of decryptedSecrets) {
    secretsObj[secret.key] = secret.value;
  }

  return { secrets: secretsObj, count: secrets.length };
}

function resolveProjectId(options: RunOptions): string | null {
  if (options.project) return options.project;
  if (process.env.RELIC_PROJECT_ID) return process.env.RELIC_PROJECT_ID;
  return null;
}

async function runWithApiKey(
  command: string[],
  options: RunOptions,
  startTime: number,
): Promise<void> {
  const spinner = ora("Authenticating with API key...").start();

  const projectId = resolveProjectId(options);
  if (!projectId) {
    const configResult = await findConfig();
    if (configResult) {
      return runWithApiKeyAndProjectId(
        command,
        options,
        configResult.config.project_id,
        spinner,
        startTime,
      );
    }
    spinner.fail(pc.red("Project ID is required. Use --project <id> or set RELIC_PROJECT_ID."));
    process.exit(1);
  }

  return runWithApiKeyAndProjectId(command, options, projectId, spinner, startTime);
}

async function runWithApiKeyAndProjectId(
  command: string[],
  options: RunOptions,
  projectId: string,
  spinner: ReturnType<typeof ora>,
  startTime: number,
): Promise<void> {
  spinner.text = "Fetching secrets via API key...";
  const { secrets, count } = await prepareSecretsWithApiKey(projectId, options);

  spinner.succeed(pc.green(`Injected ${count} secret${count !== 1 ? "s" : ""}`));

  await executeCommand(command, secrets, count, startTime);
}

async function runWithSession(
  command: string[],
  options: RunOptions,
  startTime: number,
): Promise<void> {
  const spinner = ora("Checking authentication...").start();

  const sessionValidation = await validateSession();
  if (!sessionValidation.isValid || sessionValidation.isExpired) {
    spinner.fail(pc.red("Not logged in. Run 'relic login' first."));
    process.exit(1);
  }

  spinner.text = "Verifying password...";
  const hasPass = await hasPassword();
  if (!hasPass) {
    spinner.fail(pc.red("No password set. Run 'relic tui' to set up your password first."));
    process.exit(1);
  }

  if (!(await getPasswordFromStorage())) {
    spinner.fail(pc.red("Could not retrieve password. Please re-authenticate."));
    process.exit(1);
  }

  spinner.text = "Loading configuration...";
  const configResult = await findConfig();
  if (!configResult) {
    spinner.fail(pc.red("No relic.toml found. Run 'relic init' first."));
    process.exit(1);
  }

  const projectId = resolveProjectId(options) ?? configResult.config.project_id;

  spinner.text = "Preparing secrets...";
  const db = await getCacheDb();
  const userKeyDb = await getUserKeyCacheDb();
  const api = getApi();

  const { secrets, count } = await prepareSecrets(projectId, options, db, userKeyDb, api);

  spinner.succeed(pc.green(`Injected ${count} secret${count !== 1 ? "s" : ""}`));

  await executeCommand(command, secrets, count, startTime);
}

async function executeCommand(
  command: string[],
  secrets: Record<string, string>,
  count: number,
  startTime: number,
): Promise<void> {
  const runner = await RunnerBridge.getInstance();

  const commandJson = JSON.stringify(command);
  const secretsJson = JSON.stringify(secrets);

  const commandBuffer = Buffer.from(`${commandJson}\0`, "utf-8");
  const secretsBuffer = Buffer.from(`${secretsJson}\0`, "utf-8");

  const commandPtr = ptr(commandBuffer);
  const secretsPtr = ptr(secretsBuffer);

  let exitCode = -1;
  try {
    exitCode = runner.runWithSecrets(commandPtr, secretsPtr);
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

  if (options.scope && !["client", "server", "shared"].includes(options.scope.toLowerCase())) {
    console.error(pc.red("Error: --scope must be: client, server, or shared"));
    process.exit(1);
  }
  if (options.scope) {
    options.scope = options.scope.toLowerCase() as SecretScope;
  }

  const startTime = Date.now();
  trackEvent("cli_run_started", {
    has_folder: !!options.folder,
    has_scope: !!options.scope,
    mode: isApiKeyMode() ? "api_key" : "session",
  });

  try {
    if (isApiKeyMode()) {
      await runWithApiKey(command, options, startTime);
    } else {
      await runWithSession(command, options, startTime);
    }
  } catch (err) {
    log.error("Run failed", err);
    trackEvent("cli_run_completed", { success: false, duration_ms: Date.now() - startTime });
    const spinner = ora();
    spinner.fail(pc.red(err instanceof Error ? err.message : String(err)));
    process.exit(1);
  }
}
