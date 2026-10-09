import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import type { EnvironmentData, Environment } from "../lib/api";
import secrets, { listSecretNames, SecretNamesError } from "./secrets";

const CIPHERTEXT = "ciphertext-that-must-never-leak";

const environments: Environment[] = [
  { id: "env_dev", name: "development", projectId: "proj_1" },
  { id: "env_prod", name: "production", projectId: "proj_1" },
];

const environmentData: EnvironmentData = {
  folders: [{ id: "fld_db", name: "database", environmentId: "env_dev" }],
  secrets: [
    {
      id: "s1",
      key: "STRIPE_KEY",
      encryptedValue: CIPHERTEXT,
      environmentId: "env_dev",
      valueType: "string",
      scope: "server",
    },
    {
      id: "s2",
      key: "DATABASE_URL",
      encryptedValue: CIPHERTEXT,
      environmentId: "env_dev",
      folderId: "fld_db",
      valueType: "string",
      scope: "server",
    },
    {
      id: "s3",
      key: "PUBLIC_API_URL",
      encryptedValue: CIPHERTEXT,
      environmentId: "env_dev",
      valueType: "string",
      scope: "client",
    },
  ],
};

const fakeApi = {
  getProjectEnvironments: async () => environments,
  getEnvironmentData: async () => environmentData,
};

describe("listSecretNames", () => {
  test("returns sorted names, scopes, and folders without any values", async () => {
    const result = await listSecretNames(fakeApi, "proj_1", { environment: "development" });

    expect(result).toEqual({
      projectId: "proj_1",
      environment: "development",
      folder: null,
      folders: ["database"],
      secrets: [
        { name: "DATABASE_URL", scope: "server", folder: "database" },
        { name: "PUBLIC_API_URL", scope: "client", folder: null },
        { name: "STRIPE_KEY", scope: "server", folder: null },
      ],
    });
    expect(JSON.stringify(result)).not.toContain(CIPHERTEXT);
    for (const secret of result.secrets) {
      expect(Object.keys(secret).sort()).toEqual(["folder", "name", "scope"]);
    }
  });

  test("matches environment names case-insensitively and returns the canonical name", async () => {
    const result = await listSecretNames(fakeApi, "proj_1", { environment: "DEVELOPMENT" });
    expect(result.environment).toBe("development");
  });

  test("filters by folder", async () => {
    const result = await listSecretNames(fakeApi, "proj_1", {
      environment: "development",
      folder: "Database",
    });
    expect(result.folder).toBe("database");
    expect(result.secrets.map((s) => s.name)).toEqual(["DATABASE_URL"]);
  });

  test("filters by scope", async () => {
    const result = await listSecretNames(fakeApi, "proj_1", {
      environment: "development",
      scope: "client",
    });
    expect(result.secrets.map((s) => s.name)).toEqual(["PUBLIC_API_URL"]);
  });

  test("reports unknown environments with the available names", async () => {
    const error = await listSecretNames(fakeApi, "proj_1", { environment: "staging" }).catch(
      (err: unknown) => err,
    );
    expect(error).toBeInstanceOf(SecretNamesError);
    expect((error as SecretNamesError).code).toBe("environment_not_found");
    expect((error as SecretNamesError).message).toContain("development, production");
  });

  test("reports unknown folders", async () => {
    const error = await listSecretNames(fakeApi, "proj_1", {
      environment: "development",
      folder: "cache",
    }).catch((err: unknown) => err);
    expect((error as SecretNamesError).code).toBe("folder_not_found");
  });
});

describe("secrets command", () => {
  let exitSpy: ReturnType<typeof spyOn>;
  let logSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    exitSpy = spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit");
    }) as never);
    logSpy = spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    exitSpy.mockRestore();
    logSpy.mockRestore();
  });

  test("prints a JSON error for an invalid scope", async () => {
    await expect(
      secrets({ environment: "development", scope: "everything", json: true }),
    ).rejects.toThrow("process.exit");

    expect(exitSpy).toHaveBeenCalledWith(1);
    const output = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
    expect(output.error.code).toBe("invalid_option");
  });
});
