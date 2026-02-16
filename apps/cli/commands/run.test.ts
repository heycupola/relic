import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
  type CachedUserKeys,
  cacheUserKeys,
  getCachedUserKeys,
  initializeUserKeyCacheSchema,
} from "@repo/auth";
import {
  cacheEnvironments,
  cacheFolders,
  cacheProject,
  cacheSecrets,
  getCachedEnvironmentId,
  getCachedFolderId,
  getCachedSecrets,
  initializeSchema,
} from "helpers/cache";
import type { FullUser, ProtectedApi, SecretData } from "../lib/api";
import { prepareSecrets, type RunOptions } from "./run";

const PROJECT_ID = "project_123";

const MOCK_USER_KEYS: CachedUserKeys = {
  encryptedPrivateKey: "enc_private_key_test",
  salt: "salt_test",
  keysUpdatedAt: 1700000000,
};

const MOCK_FULL_USER: FullUser = {
  id: "user_123",
  name: "Test User",
  email: "test@test.com",
  hasPro: false,
  publicKey: "pub_key_test",
  encryptedPrivateKey: "enc_private_key_test",
  salt: "salt_test",
  keysUpdatedAt: 1700000000,
};

const MOCK_SECRETS: SecretData[] = [
  { id: "s1", key: "API_KEY", encryptedValue: "enc_val_1", scope: "shared", valueType: "string" },
  { id: "s2", key: "DB_HOST", encryptedValue: "enc_val_2", scope: "server", valueType: "string" },
];

const MOCK_EXPORT_RESULT = {
  secrets: MOCK_SECRETS,
  count: 2,
  encryptedProjectKey: "enc_project_key_test",
  environmentId: "env_123",
  folderId: null as string | null,
};

const MOCK_DECRYPTED_SECRETS = [
  { key: "API_KEY", value: "my-api-key" },
  { key: "DB_HOST", value: "localhost:5432" },
];

const DEFAULT_OPTIONS: RunOptions = {
  environment: "development",
};

class MockProjectKeyError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = "ProjectKeyError";
    this.code = code;
  }
}

const mockGetProjectKey = mock(() => Promise.resolve("mock_crypto_key" as unknown as CryptoKey));
const mockDecryptSecrets = mock(() => Promise.resolve(MOCK_DECRYPTED_SECRETS));

mock.module("../lib/crypto", () => ({
  getProjectKey: mockGetProjectKey,
  decryptSecrets: mockDecryptSecrets,
  ProjectKeyError: MockProjectKeyError,
}));

function createMockApi(overrides: Partial<ProtectedApi> = {}): ProtectedApi {
  return {
    getFullUser: mock(() => Promise.resolve(MOCK_FULL_USER)),
    exportSecrets: mock(() => Promise.resolve(MOCK_EXPORT_RESULT)),
    getSecretsCacheValidation: mock(() => Promise.resolve(null)),
    getProjectShare: mock(() => Promise.resolve(null)),
    // NOTE: stubs for unused methods
    getCurrentUser: mock(() => Promise.resolve({} as any)),
    listProjects: mock(() => Promise.resolve([])),
    listSharedProjects: mock(() => Promise.resolve([])),
    getProjectEnvironments: mock(() => Promise.resolve([])),
    getEnvironmentData: mock(() => Promise.resolve({} as any)),
    getProject: mock(() => Promise.resolve({} as any)),
    getSecretsForFolder: mock(() => Promise.resolve([])),
    ...overrides,
  } as unknown as ProtectedApi;
}

function createProjectCacheDb(): Database {
  const db = new Database(":memory:");
  initializeSchema(db);
  return db;
}

function createUserKeyCacheDb(): Database {
  const db = new Database(":memory:");
  initializeUserKeyCacheSchema(db);
  return db;
}

function seedSecretCache(db: Database, opts?: { environmentId?: string; folderId?: string }) {
  const envId = opts?.environmentId ?? "env_123";
  const folderId = opts?.folderId ?? undefined;

  cacheEnvironments(db, PROJECT_ID, [{ id: envId, name: "development" }]);
  cacheProject(db, PROJECT_ID, "enc_project_key_test");
  cacheSecrets(db, PROJECT_ID, envId, folderId, MOCK_SECRETS, Date.now());
}

describe("prepareSecrets", () => {
  let db: Database;
  let userKeyDb: Database;

  beforeEach(() => {
    db = createProjectCacheDb();
    userKeyDb = createUserKeyCacheDb();
    mockGetProjectKey.mockClear();
    mockDecryptSecrets.mockClear();
  });

  test("should return decrypted secrets not using cache data", async () => {
    const api = createMockApi();
    const result = await prepareSecrets(PROJECT_ID, DEFAULT_OPTIONS, db, userKeyDb, api);

    expect(api.getFullUser).toHaveBeenCalled();
    expect(api.exportSecrets).toHaveBeenCalled();

    expect(result.count).toBe(MOCK_SECRETS.length);
    expect(result.secrets).toEqual({
      API_KEY: "my-api-key",
      DB_HOST: "localhost:5432",
    });

    expect(mockGetProjectKey).toHaveBeenCalledWith(
      "enc_project_key_test",
      "enc_private_key_test",
      "salt_test",
    );
    expect(mockDecryptSecrets).toHaveBeenCalledTimes(1);

    const cached = getCachedUserKeys(userKeyDb);
    expect(cached).not.toBeNull();
    expect(cached!.encryptedPrivateKey).toBe("enc_private_key_test");
    expect(cached!.salt).toBe("salt_test");
    expect(api.getSecretsCacheValidation).not.toHaveBeenCalled();
  });

  test("should return decrypted secrets using cache data", async () => {
    cacheUserKeys(userKeyDb, MOCK_USER_KEYS);
    seedSecretCache(db);

    const api = createMockApi({
      getSecretsCacheValidation: mock(() => Promise.resolve({ updatedAt: 1 })),
    });

    const result = await prepareSecrets(PROJECT_ID, DEFAULT_OPTIONS, db, userKeyDb, api);

    expect(api.getFullUser).not.toHaveBeenCalled();
    expect(api.exportSecrets).not.toHaveBeenCalled();
    expect(api.getSecretsCacheValidation).toHaveBeenCalledTimes(1);
    expect(result.count).toBe(2);
    expect(result.secrets).toEqual({
      API_KEY: "my-api-key",
      DB_HOST: "localhost:5432",
    });
    expect(mockGetProjectKey).toHaveBeenCalledWith(
      "enc_project_key_test",
      "enc_private_key_test",
      "salt_test",
    );
    expect(mockDecryptSecrets).toHaveBeenCalledTimes(1);
  });

  test("should fall through to API when project key is not cached", async () => {
    cacheUserKeys(userKeyDb, MOCK_USER_KEYS);

    cacheEnvironments(db, PROJECT_ID, [{ id: "env_123", name: "development" }]);
    cacheSecrets(db, PROJECT_ID, "env_123", undefined, MOCK_SECRETS, Date.now());
    // NOTE: no cacheProject call

    const api = createMockApi({
      getSecretsCacheValidation: mock(() => Promise.resolve({ updatedAt: 1 })),
    });
    const result = await prepareSecrets(PROJECT_ID, DEFAULT_OPTIONS, db, userKeyDb, api);

    expect(api.exportSecrets).toHaveBeenCalledTimes(1);
    expect(api.getFullUser).not.toHaveBeenCalled();
    expect(result.count).toBe(2);
    expect(result.secrets).toEqual({
      API_KEY: "my-api-key",
      DB_HOST: "localhost:5432",
    });
  });

  test("should fetch from API when cache is expired", async () => {
    cacheUserKeys(userKeyDb, MOCK_USER_KEYS);
    seedSecretCache(db);

    const api = createMockApi({
      getSecretsCacheValidation: mock(() => Promise.resolve({ updatedAt: Date.now() + 100000 })),
    });

    const result = await prepareSecrets(PROJECT_ID, DEFAULT_OPTIONS, db, userKeyDb, api);

    expect(api.getSecretsCacheValidation).toHaveBeenCalledTimes(1);
    expect(api.exportSecrets).toHaveBeenCalledTimes(1);
    expect(api.getFullUser).not.toHaveBeenCalled();

    expect(result.count).toBe(2);
    expect(result.secrets).toEqual({
      API_KEY: "my-api-key",
      DB_HOST: "localhost:5432",
    });
  });

  test("should retry with fresh user keys when cached keys are stale", async () => {
    cacheUserKeys(userKeyDb, {
      encryptedPrivateKey: "stale_key",
      salt: "stale_salt",
      keysUpdatedAt: 1600000000,
    });

    let callCount = 0;
    mockGetProjectKey.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.reject(
          new MockProjectKeyError("Failed to decrypt project key.", "DECRYPTION_FAILED"),
        );
      }
      return Promise.resolve("mock_crypto_key" as unknown as CryptoKey);
    });

    const api = createMockApi();
    const result = await prepareSecrets(PROJECT_ID, DEFAULT_OPTIONS, db, userKeyDb, api);

    // resolveUserKeys uses stale cached keys (no getFullUser call)
    // resolveProjectKey fails, retries -> calls getFullUser once for fresh keys
    expect(api.getFullUser).toHaveBeenCalledTimes(1);
    expect(mockGetProjectKey).toHaveBeenCalledTimes(2);

    // stale keys should be replaced with fresh ones from API
    const cached = getCachedUserKeys(userKeyDb);
    expect(cached).not.toBeNull();
    expect(cached!.encryptedPrivateKey).toBe("enc_private_key_test");
    expect(cached!.salt).toBe("salt_test");

    expect(result.count).toBe(2);
    expect(result.secrets).toEqual({
      API_KEY: "my-api-key",
      DB_HOST: "localhost:5432",
    });
  });

  test("should throw when no secrets are found", async () => {
    const api = createMockApi({
      exportSecrets: mock(() => Promise.resolve({ ...MOCK_EXPORT_RESULT, count: 0, secrets: [] })),
    });

    expect(prepareSecrets(PROJECT_ID, DEFAULT_OPTIONS, db, userKeyDb, api)).rejects.toThrow(
      "No secrets found",
    );
  });

  test("should throw when user has no encryption keys", async () => {
    const api = createMockApi({
      getFullUser: mock(() =>
        Promise.resolve({
          ...MOCK_FULL_USER,
          encryptedPrivateKey: undefined,
          salt: undefined,
        }),
      ),
    });

    expect(prepareSecrets(PROJECT_ID, DEFAULT_OPTIONS, db, userKeyDb, api)).rejects.toThrow(
      "No encryption keys found",
    );
  });

  test("should cache environment ID after fetching from API", async () => {
    const api = createMockApi();
    await prepareSecrets(PROJECT_ID, DEFAULT_OPTIONS, db, userKeyDb, api);

    expect(api.exportSecrets).toHaveBeenCalledTimes(1);

    const cachedEnvId = getCachedEnvironmentId(db, PROJECT_ID, "development");
    expect(cachedEnvId).toBe("env_123");
  });

  test("should cache folder ID after fetching from API with folder option", async () => {
    const api = createMockApi({
      exportSecrets: mock(() =>
        Promise.resolve({
          ...MOCK_EXPORT_RESULT,
          folderId: "folder_123",
        }),
      ),
    });

    const options: RunOptions = {
      environment: "development",
      folder: "backend",
    };

    await prepareSecrets(PROJECT_ID, options, db, userKeyDb, api);

    expect(api.exportSecrets).toHaveBeenCalledTimes(1);

    const cachedEnvId = getCachedEnvironmentId(db, PROJECT_ID, "development");
    expect(cachedEnvId).toBe("env_123");

    const cachedFoldId = getCachedFolderId(db, PROJECT_ID, "env_123", "backend");
    expect(cachedFoldId).toBe("folder_123");
  });

  test("should use cache on second run after API populates it", async () => {
    const api = createMockApi({
      getSecretsCacheValidation: mock(() => Promise.resolve({ updatedAt: 1 })),
    });

    // First run: hits API, should populate cache
    await prepareSecrets(PROJECT_ID, DEFAULT_OPTIONS, db, userKeyDb, api);
    expect(api.exportSecrets).toHaveBeenCalledTimes(1);

    // Second run: should use cache, not hit API again
    const result = await prepareSecrets(PROJECT_ID, DEFAULT_OPTIONS, db, userKeyDb, api);
    expect(api.exportSecrets).toHaveBeenCalledTimes(1);
    expect(api.getSecretsCacheValidation).toHaveBeenCalled();
    expect(result.count).toBe(2);
  });

  test("should filter cached secrets by scope", async () => {
    cacheUserKeys(userKeyDb, MOCK_USER_KEYS);
    seedSecretCache(db);
    mockDecryptSecrets.mockImplementation(() =>
      Promise.resolve([{ key: "DB_HOST", value: "localhost:5432" }]),
    );

    const api = createMockApi({
      getSecretsCacheValidation: mock(() => Promise.resolve({ updatedAt: 1 })),
    });

    const options: RunOptions = { environment: "development", scope: "server" };
    const result = await prepareSecrets(PROJECT_ID, options, db, userKeyDb, api);

    expect(api.exportSecrets).not.toHaveBeenCalled();
    expect(result.count).toBe(1);
    expect(result.secrets).toEqual({ DB_HOST: "localhost:5432" });
  });

  test("should filter API response by scope and cache all secrets", async () => {
    mockDecryptSecrets.mockImplementation(() =>
      Promise.resolve([{ key: "DB_HOST", value: "localhost:5432" }]),
    );

    const api = createMockApi({
      getSecretsCacheValidation: mock(() => Promise.resolve({ updatedAt: 1 })),
    });

    const options: RunOptions = { environment: "development", scope: "server" };
    const result = await prepareSecrets(PROJECT_ID, options, db, userKeyDb, api);

    // Should only return the server-scoped secret
    expect(api.exportSecrets).toHaveBeenCalledTimes(1);
    expect(result.count).toBe(1);
    expect(result.secrets).toEqual({ DB_HOST: "localhost:5432" });

    // But all secrets should be cached (not just server-scoped)
    const allCached = getCachedSecrets(db, PROJECT_ID, "env_123", undefined, undefined);
    expect(allCached).not.toBeNull();
    expect(allCached!.length).toBe(2);
  });

  test("should serve scoped request from cache after unscoped run", async () => {
    const api = createMockApi({
      getSecretsCacheValidation: mock(() => Promise.resolve({ updatedAt: 1 })),
    });

    // First run: unscoped, populates cache with all secrets
    await prepareSecrets(PROJECT_ID, DEFAULT_OPTIONS, db, userKeyDb, api);
    expect(api.exportSecrets).toHaveBeenCalledTimes(1);

    // Second run: scoped, should use cache without hitting API
    mockDecryptSecrets.mockImplementation(() =>
      Promise.resolve([{ key: "API_KEY", value: "my-api-key" }]),
    );
    const options: RunOptions = { environment: "development", scope: "shared" };
    const result = await prepareSecrets(PROJECT_ID, options, db, userKeyDb, api);
    expect(api.exportSecrets).toHaveBeenCalledTimes(1);
    expect(result.count).toBe(1);
    expect(result.secrets).toEqual({ API_KEY: "my-api-key" });
  });
});
