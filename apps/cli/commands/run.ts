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
import { getApi, type ProtectedApi, type SecretData } from "../lib/api";
import { findConfig } from "../lib/config";
import { decryptSecrets, getProjectKey, ProjectKeyError } from "../lib/crypto";

export interface RunOptions {
  environment: string;
  folder?: string;
  scope?: SecretScope;
}

export interface PrepareSecretsResult {
  secrets: Record<string, string>;
  count: number;
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
  // NOTE: Check local cache for environment/folder IDs and secrets
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

    // NOTE: Try loading from cache first
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

  // NOTE: Fallback to API if cache is invalid, empty, or partially missing
  const result = await api.exportSecrets({
    projectId,
    environmentName: options.environment,
    folderName: options.folder,
  });

  if (result.count === 0) {
    throw new Error("No secrets found");
  }

  // NOTE: Cache the exported secrets and project key for future runs
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
    // NOTE: Only retry with fresh keys if:
    // 1. We used cached keys (fromCache)
    // 2. The error is a decryption failure (not a missing password or unknown error)
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
  // Step 1: Resolve user keys (cache-first with API fallback)
  const userKeys = await resolveUserKeys(userKeyDb, api);

  // Step 2: Resolve secrets and project key (cache-first with API fallback)
  const { secrets, encryptedProjectKey } = await resolveSecrets(db, projectId, options, api);

  // Step 3: Decrypt project key (with stale-cache retry)
  const projectKey = await resolveProjectKey(
    encryptedProjectKey,
    userKeys.encryptedPrivateKey,
    userKeys.salt,
    userKeys.fromCache,
    userKeyDb,
    api,
  );

  // Step 4: Decrypt secrets
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

  const spinner = ora("Checking authentication...").start();

  try {
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

    const projectId = configResult.config.project_id;

    spinner.text = "Preparing secrets...";
    const db = await getCacheDb();
    const userKeyDb = await getUserKeyCacheDb();
    const api = getApi();

    const { secrets, count } = await prepareSecrets(projectId, options, db, userKeyDb, api);

    spinner.succeed(pc.green(`Injected ${count} secret${count !== 1 ? "s" : ""}`));

    const runner = await RunnerBridge.getInstance();

    const commandJson = JSON.stringify(command);
    const secretsJson = JSON.stringify(secrets);

    const commandBuffer = Buffer.from(`${commandJson}\0`, "utf-8");
    const secretsBuffer = Buffer.from(`${secretsJson}\0`, "utf-8");

    const commandPtr = ptr(commandBuffer);
    const secretsPtr = ptr(secretsBuffer);

    const exitCode = runner.runWithSecrets(commandPtr, secretsPtr);
    commandBuffer.fill(0);
    secretsBuffer.fill(0);
    process.exit(exitCode);
  } catch (err) {
    spinner.fail(pc.red(err instanceof Error ? err.message : String(err)));
    process.exit(1);
  }
}
