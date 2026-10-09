import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { RunOptions } from "./run";

const EXPORT_RESPONSE = {
  secrets: [
    { id: "s1", key: "API_KEY", encryptedValue: "enc_val_1", scope: "shared", valueType: "string" },
  ],
  count: 1,
  environmentId: "env_123",
  folderId: null,
  encryptedProjectKey: "sa_enc_project_key",
  encryptedPrivateKey: "sa_enc_private_key",
  salt: "sa_salt",
};

const mockExportSecretsViaServiceToken = mock(() => Promise.resolve(EXPORT_RESPONSE));
const mockUnwrapProjectKeyWithServiceToken = mock(() =>
  Promise.resolve("mock_project_key" as unknown as CryptoKey),
);
const mockDecryptSecrets = mock(() =>
  Promise.resolve([{ key: "API_KEY", value: "decrypted-value" }]),
);

class ProPlanRequiredError extends Error {
  upgradeUrl: string;
  constructor(message: string, upgradeUrl: string) {
    super(message);
    this.upgradeUrl = upgradeUrl;
  }
}

const realApi = { ...(await import("../lib/api")) };
mock.module("../lib/api", () => ({
  ...realApi,
  exportSecretsViaServiceToken: mockExportSecretsViaServiceToken,
  getApi: mock(() => ({})),
  ProPlanRequiredError,
}));

mock.module("../lib/crypto", () => ({
  decryptSecrets: mockDecryptSecrets,
  getProjectKey: mock(),
  ProjectKeyError: class ProjectKeyError extends Error {},
}));

const realCrypto = { ...(await import("@repo/crypto")) };
mock.module("@repo/crypto", () => ({
  ...realCrypto,
  unwrapProjectKeyWithServiceToken: mockUnwrapProjectKeyWithServiceToken,
}));

const { prepareSecretsWithServiceToken } = await import("./run");

const OIDC_ENV_VARS = [
  "RELIC_OIDC_TOKEN",
  "ACTIONS_ID_TOKEN_REQUEST_URL",
  "ACTIONS_ID_TOKEN_REQUEST_TOKEN",
  "CI_JOB_JWT_V2",
] as const;

describe("prepareSecretsWithServiceToken", () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const name of [...OIDC_ENV_VARS, "RELIC_SERVICE_TOKEN"]) {
      savedEnv[name] = process.env[name];
      delete process.env[name];
    }
    process.env.RELIC_SERVICE_TOKEN = "relic_sa_test_token";

    mockExportSecretsViaServiceToken.mockClear();
    mockUnwrapProjectKeyWithServiceToken.mockClear();
    mockDecryptSecrets.mockClear();
    mockExportSecretsViaServiceToken.mockImplementation(() => Promise.resolve(EXPORT_RESPONSE));
  });

  afterEach(() => {
    for (const [name, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  test("exports via service token and unwraps with the service account keys", async () => {
    const options: RunOptions = { environment: "production", folder: "api", scope: "server" };
    const result = await prepareSecretsWithServiceToken(options);

    expect(mockExportSecretsViaServiceToken).toHaveBeenCalledWith(
      "relic_sa_test_token",
      { environmentName: "production", folderName: "api", scope: "server" },
      undefined,
    );
    expect(mockUnwrapProjectKeyWithServiceToken).toHaveBeenCalledWith(
      "sa_enc_project_key",
      "sa_enc_private_key",
      "relic_sa_test_token",
      "sa_salt",
    );
    expect(result).toEqual({ secrets: { API_KEY: "decrypted-value" }, count: 1 });
  });

  test("forwards an explicit OIDC token", async () => {
    process.env.RELIC_OIDC_TOKEN = "oidc-jwt";

    await prepareSecretsWithServiceToken({ environment: "production" });

    expect(mockExportSecretsViaServiceToken).toHaveBeenCalledWith(
      "relic_sa_test_token",
      { environmentName: "production", folderName: undefined, scope: undefined },
      "oidc-jwt",
    );
  });

  test("throws when the export is empty", async () => {
    mockExportSecretsViaServiceToken.mockImplementation(() =>
      Promise.resolve({ ...EXPORT_RESPONSE, secrets: [], count: 0 }),
    );

    await expect(prepareSecretsWithServiceToken({ environment: "production" })).rejects.toThrow(
      "No secrets found",
    );
    expect(mockUnwrapProjectKeyWithServiceToken).not.toHaveBeenCalled();
  });

  test("requires RELIC_SERVICE_TOKEN", async () => {
    delete process.env.RELIC_SERVICE_TOKEN;

    await expect(prepareSecretsWithServiceToken({ environment: "production" })).rejects.toThrow(
      "RELIC_SERVICE_TOKEN is required",
    );
    expect(mockExportSecretsViaServiceToken).not.toHaveBeenCalled();
  });
});
