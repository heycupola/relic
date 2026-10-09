import { describe, expect, mock, test } from "bun:test";
import { GuardConfigError, loadSecretValues, type ValuesDeps } from "./values";

const ENVIRONMENTS = [
  { id: "env_dev", name: "development", projectId: "project_123" },
  { id: "env_prod", name: "production", projectId: "project_123" },
];

const ENCRYPTED: Record<string, { key: string; encryptedValue: string }[]> = {
  env_dev: [{ key: "API_KEY", encryptedValue: "enc:dev-api-key-123" }],
  env_prod: [
    { key: "API_KEY", encryptedValue: "enc:prod-api-key-456" },
    { key: "DEBUG", encryptedValue: "enc:false" },
  ],
};

function createDeps(overrides: Partial<ValuesDeps> = {}): ValuesDeps {
  const api = {
    getFullUser: mock(() =>
      Promise.resolve({
        id: "user_1",
        name: "Test",
        email: "t@test.dev",
        hasPro: false,
        encryptedPrivateKey: "enc_private",
        salt: "salt",
      }),
    ),
    getProject: mock(() =>
      Promise.resolve({
        id: "project_123",
        name: "p",
        slug: "p",
        encryptedProjectKey: "owner_key",
        keyVersion: 1,
        isArchived: false,
        ownerId: "user_1",
      }),
    ),
    getProjectShare: mock(() => Promise.resolve({ encryptedProjectKey: "share_key" })),
    getProjectEnvironments: mock(() => Promise.resolve(ENVIRONMENTS)),
    getEnvironmentData: mock((id: string) =>
      Promise.resolve({
        secrets: ENCRYPTED[id]!.map((s, i) => ({
          ...s,
          id: `${id}_${i}`,
          environmentId: id,
          valueType: "string" as const,
          scope: "shared" as const,
        })),
        folders: [],
      }),
    ),
  };

  return {
    env: {},
    validateSession: mock(() => Promise.resolve({ isValid: true, isExpired: false })),
    getPassword: mock(() => Promise.resolve("password")),
    getApi: mock(() => Promise.resolve(api)),
    getProjectKey: mock(() => Promise.resolve("project_key" as unknown as CryptoKey)),
    decryptSecrets: mock((_key: CryptoKey, secrets: { key: string; encryptedValue: string }[]) =>
      Promise.resolve(secrets.map((s) => ({ key: s.key, value: s.encryptedValue.slice(4) }))),
    ),
    exportWithServiceToken: mock(() => Promise.resolve({})),
    exportWithApiKey: mock(() => Promise.resolve({})),
    ...overrides,
  };
}

const BASE = { projectId: "project_123", environments: [], minLength: 8 };

describe("loadSecretValues (session)", () => {
  test("decrypts every environment by default", async () => {
    const deps = createDeps();
    const result = await loadSecretValues(BASE, deps);

    expect(result.status).toBe("loaded");
    if (result.status !== "loaded") return;
    expect(result.environments).toEqual(["development", "production"]);
    expect(result.patterns.values.sort()).toEqual(["dev-api-key-123", "prod-api-key-456"]);
    expect(result.patterns.skipped).toBe(1);
    expect(deps.getProjectKey).toHaveBeenCalledWith("owner_key", "enc_private", "salt");
  });

  test("only loads the requested environments, case-insensitively", async () => {
    const deps = createDeps();
    const result = await loadSecretValues({ ...BASE, environments: ["Production"] }, deps);

    expect(result.status === "loaded" && result.environments).toEqual(["production"]);
    const api = await deps.getApi();
    expect(api.getEnvironmentData).toHaveBeenCalledTimes(1);
  });

  test("throws for an unknown environment", async () => {
    expect(loadSecretValues({ ...BASE, environments: ["prod"] }, createDeps())).rejects.toThrow(
      GuardConfigError,
    );
  });

  test("uses the share key for projects shared with the user", async () => {
    const deps = createDeps();
    const api = await deps.getApi();
    (api.getProject as ReturnType<typeof mock>).mockImplementation(() =>
      Promise.resolve({ encryptedProjectKey: "owner_key", ownerId: "someone_else" }),
    );

    await loadSecretValues(BASE, deps);
    expect(deps.getProjectKey).toHaveBeenCalledWith("share_key", "enc_private", "salt");
  });

  test("skips when not logged in", async () => {
    const deps = createDeps({
      validateSession: mock(() => Promise.resolve({ isValid: false, isExpired: false })),
    });
    const result = await loadSecretValues(BASE, deps);
    expect(result).toEqual({ status: "skipped", reason: "not logged in (run `relic login`)" });
    expect(deps.getApi).not.toHaveBeenCalled();
  });

  test("skips without a linked project", async () => {
    const result = await loadSecretValues({ ...BASE, projectId: null }, createDeps());
    expect(result.status).toBe("skipped");
  });

  test("skips when the network is unreachable", async () => {
    const deps = createDeps({
      getApi: mock(() =>
        Promise.resolve({
          getProjectEnvironments: () => Promise.reject(new Error("fetch failed")),
        } as never),
      ),
    });
    const result = await loadSecretValues(BASE, deps);
    expect(result).toEqual({ status: "skipped", reason: "could not load secrets (fetch failed)" });
  });

  test("skips when loading takes too long", async () => {
    const deps = createDeps({ validateSession: () => new Promise(() => {}) });
    const result = await loadSecretValues({ ...BASE, timeoutMs: 20 }, deps);
    expect(result).toEqual({ status: "skipped", reason: "timed out after 0.02s" });
  });
});

describe("loadSecretValues (CI tokens)", () => {
  test("uses the service token exporter for each requested environment", async () => {
    const exportWithServiceToken = mock((environment: string) =>
      Promise.resolve({ TOKEN: `${environment}-service-token` }),
    );
    const deps = createDeps({ env: { RELIC_SERVICE_TOKEN: "rst_x" }, exportWithServiceToken });

    const result = await loadSecretValues(
      { ...BASE, environments: ["production", "staging"] },
      deps,
    );

    expect(result.status === "loaded" && result.patterns.values).toEqual([
      "production-service-token",
      "staging-service-token",
    ]);
    expect(deps.validateSession).not.toHaveBeenCalled();
  });

  test("service tokens need an explicit environment", async () => {
    const deps = createDeps({ env: { RELIC_SERVICE_TOKEN: "rst_x" } });
    const result = await loadSecretValues(BASE, deps);
    expect(result.status).toBe("skipped");
    expect(deps.exportWithServiceToken).not.toHaveBeenCalled();
  });

  test("uses the API key exporter with the project id", async () => {
    const exportWithApiKey = mock(() => Promise.resolve({ KEY: "api-key-secret-1" }));
    const deps = createDeps({ env: { RELIC_API_KEY: "relic_x" }, exportWithApiKey });

    const result = await loadSecretValues({ ...BASE, environments: ["production"] }, deps);
    expect(result.status).toBe("loaded");
    expect(exportWithApiKey).toHaveBeenCalledWith("project_123", "production");
  });
});
