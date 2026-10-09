import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { RunOptions } from "./run";

const realAuth = { ...(await import("@repo/auth")) };
const realApi = { ...(await import("../lib/api")) };
const realCrypto = { ...(await import("@repo/crypto")) };

const userKeyDb = new Database(":memory:");
realAuth.initializeUserKeyCacheSchema(userKeyDb);

const mockClearCachedUserKeys = mock(realAuth.clearCachedUserKeys);
const mockGetPasswordFromStorage = mock(() => Promise.resolve("test-password"));

const mockExportSecretsViaApiKey = mock(() =>
  Promise.resolve({
    secrets: [{ key: "API_KEY", encryptedValue: "enc_val_1" }],
    count: 1,
    encryptedProjectKey: "enc_project_key",
    environmentId: "env_123",
    folderId: null,
  }),
);
const mockFetchUserKeysViaApiKey = mock(() =>
  Promise.resolve({
    encryptedPrivateKey: "fresh_encrypted_private_key",
    salt: "fresh_salt",
    publicKey: "fresh_public_key",
  }),
);
const mockDecryptSecrets = mock(() =>
  Promise.resolve([{ key: "API_KEY", value: "decrypted-value" }]),
);
const mockUnwrapProjectKey = mock(() =>
  Promise.resolve("mock_project_key" as unknown as CryptoKey),
);

mock.module("@repo/auth", () => ({
  ...realAuth,
  clearCachedUserKeys: mockClearCachedUserKeys,
  getPasswordFromStorage: mockGetPasswordFromStorage,
  getUserKeyCacheDb: mock(() => Promise.resolve(userKeyDb)),
}));

class ProPlanRequiredError extends Error {
  upgradeUrl: string;
  constructor(message: string, upgradeUrl: string) {
    super(message);
    this.name = "ProPlanRequiredError";
    this.upgradeUrl = upgradeUrl;
  }
}

mock.module("../lib/api", () => ({
  ...realApi,
  exportSecretsViaApiKey: mockExportSecretsViaApiKey,
  fetchUserKeysViaApiKey: mockFetchUserKeysViaApiKey,
  getApi: mock(() => ({})),
  ProPlanRequiredError,
}));

mock.module("../lib/crypto", () => ({
  decryptSecrets: mockDecryptSecrets,
  getProjectKey: mock(() => Promise.resolve("unused_project_key")),
  ProjectKeyError: class ProjectKeyError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.code = code;
    }
  },
}));

mock.module("@repo/crypto", () => ({
  ...realCrypto,
  unwrapProjectKey: mockUnwrapProjectKey,
}));

const { prepareSecretsWithApiKey } = await import("./run");

const DEFAULT_OPTIONS: RunOptions = {
  environment: "development",
};

describe("prepareSecretsWithApiKey", () => {
  beforeEach(() => {
    process.env.RELIC_API_KEY = "test-api-key";
    realAuth.clearCachedUserKeys(userKeyDb);

    mockClearCachedUserKeys.mockClear();
    mockGetPasswordFromStorage.mockClear();
    mockExportSecretsViaApiKey.mockClear();
    mockFetchUserKeysViaApiKey.mockClear();
    mockDecryptSecrets.mockClear();
    mockUnwrapProjectKey.mockClear();

    mockGetPasswordFromStorage.mockImplementation(() => Promise.resolve("test-password"));
    mockExportSecretsViaApiKey.mockImplementation(() =>
      Promise.resolve({
        secrets: [{ key: "API_KEY", encryptedValue: "enc_val_1" }],
        count: 1,
        encryptedProjectKey: "enc_project_key",
        environmentId: "env_123",
        folderId: null,
      }),
    );
    mockFetchUserKeysViaApiKey.mockImplementation(() =>
      Promise.resolve({
        encryptedPrivateKey: "fresh_encrypted_private_key",
        salt: "fresh_salt",
        publicKey: "fresh_public_key",
      }),
    );
    mockDecryptSecrets.mockImplementation(() =>
      Promise.resolve([{ key: "API_KEY", value: "decrypted-value" }]),
    );
    mockUnwrapProjectKey.mockImplementation(() =>
      Promise.resolve("mock_project_key" as unknown as CryptoKey),
    );
  });

  afterEach(() => {
    delete process.env.RELIC_API_KEY;
  });

  test("retries with fresh keys when cached API-key keys are stale", async () => {
    realAuth.cacheUserKeys(userKeyDb, {
      encryptedPrivateKey: "stale_encrypted_private_key",
      salt: "stale_salt",
      keysUpdatedAt: 1,
    });

    let unwrapCalls = 0;
    mockUnwrapProjectKey.mockImplementation(() => {
      unwrapCalls++;
      if (unwrapCalls === 1) {
        return Promise.reject(new Error("Failed to unwrap project key"));
      }
      return Promise.resolve("mock_project_key" as unknown as CryptoKey);
    });

    const result = await prepareSecretsWithApiKey("project_123", DEFAULT_OPTIONS);

    expect(mockClearCachedUserKeys).toHaveBeenCalledTimes(1);
    expect(mockFetchUserKeysViaApiKey).toHaveBeenCalledTimes(1);
    expect(mockUnwrapProjectKey).toHaveBeenCalledTimes(2);
    expect(mockUnwrapProjectKey).toHaveBeenNthCalledWith(
      1,
      "enc_project_key",
      "stale_encrypted_private_key",
      "test-password",
      "stale_salt",
    );
    expect(mockUnwrapProjectKey).toHaveBeenNthCalledWith(
      2,
      "enc_project_key",
      "fresh_encrypted_private_key",
      "test-password",
      "fresh_salt",
    );
    expect(realAuth.getCachedUserKeys(userKeyDb)?.encryptedPrivateKey).toBe(
      "fresh_encrypted_private_key",
    );
    expect(realAuth.getCachedUserKeys(userKeyDb)?.salt).toBe("fresh_salt");
    expect(result.secrets).toEqual({ API_KEY: "decrypted-value" });
  });

  test("does not retry when keys are not from cache", async () => {
    realAuth.clearCachedUserKeys(userKeyDb);
    mockUnwrapProjectKey.mockImplementation(() =>
      Promise.reject(new Error("Failed to unwrap project key")),
    );

    await expect(prepareSecretsWithApiKey("project_123", DEFAULT_OPTIONS)).rejects.toThrow(
      "Failed to unwrap project key",
    );

    // first fetch is for normal key resolution; there should be no extra fetch for retry
    expect(mockFetchUserKeysViaApiKey).toHaveBeenCalledTimes(1);
    expect(mockClearCachedUserKeys).not.toHaveBeenCalled();
    expect(mockUnwrapProjectKey).toHaveBeenCalledTimes(1);
  });

  test("bubbles error when retry with fresh keys also fails", async () => {
    realAuth.cacheUserKeys(userKeyDb, {
      encryptedPrivateKey: "stale_encrypted_private_key",
      salt: "stale_salt",
      keysUpdatedAt: 1,
    });

    mockUnwrapProjectKey.mockImplementation(() =>
      Promise.reject(new Error("Failed to unwrap project key")),
    );

    await expect(prepareSecretsWithApiKey("project_123", DEFAULT_OPTIONS)).rejects.toThrow(
      "Failed to unwrap project key",
    );

    expect(mockClearCachedUserKeys).toHaveBeenCalledTimes(1);
    expect(mockFetchUserKeysViaApiKey).toHaveBeenCalledTimes(1);
    expect(mockUnwrapProjectKey).toHaveBeenCalledTimes(2);
  });

  test("propagates ProPlanRequiredError from export", async () => {
    mockExportSecretsViaApiKey.mockImplementation(() =>
      Promise.reject(
        new ProPlanRequiredError(
          "API keys require a Pro plan.",
          "https://withrelic.com/dashboard?action=upgrade",
        ),
      ),
    );

    const err = await prepareSecretsWithApiKey("project_123", DEFAULT_OPTIONS).catch((e) => e);

    expect(err).toBeInstanceOf(ProPlanRequiredError);
    expect(err.message).toBe("API keys require a Pro plan.");
    expect(err.upgradeUrl).toBe("https://withrelic.com/dashboard?action=upgrade");
  });

  test("propagates ProPlanRequiredError from user keys fetch", async () => {
    mockFetchUserKeysViaApiKey.mockImplementation(() =>
      Promise.reject(
        new ProPlanRequiredError(
          "API keys require a Pro plan.",
          "https://withrelic.com/dashboard?action=upgrade",
        ),
      ),
    );

    const err = await prepareSecretsWithApiKey("project_123", DEFAULT_OPTIONS).catch((e) => e);

    expect(err).toBeInstanceOf(ProPlanRequiredError);
    expect(err.upgradeUrl).toBe("https://withrelic.com/dashboard?action=upgrade");
  });
});
