import { Database } from "bun:sqlite";
import { beforeEach, describe, expect, test } from "bun:test";
import { basename, join } from "node:path";
import { getConfigDir } from "@repo/auth";
import type { SecretData } from "../lib/api";
import {
  cacheEnvironments,
  cacheFolders,
  cacheProject,
  cacheSecrets,
  getCachedEnvironmentId,
  getCachedFolderId,
  getCachedSecrets,
  getGlobalCacheDbPath,
  initializeSchema,
  loadCachedEncryptedProjectKey,
  loadSecretsLastCachedTime,
} from "./cache";

function createTestDb(): Database {
  const db = new Database(":memory:");
  initializeSchema(db);
  return db;
}

describe("cache", () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDb();
  });

  test("it caches environment successfully", () => {
    cacheEnvironments(db, "project1_id", [
      { id: "env1_id", name: "env_1" },
      { id: "env2_id", name: "env_2" },
    ]);

    expect(getCachedEnvironmentId(db, "project1_id", "env_1")).toBe("env1_id");
    expect(getCachedEnvironmentId(db, "project1_id", "env_2")).toBe("env2_id");
  });

  test("it caches folder successfully", () => {
    cacheFolders(db, "project1_id", [
      {
        id: "folder1_id",
        environmentId: "env1_id",
        name: "folder1",
      },
      {
        id: "folder2_id",
        environmentId: "env1_id",
        name: "folder2",
      },
    ]);

    expect(getCachedFolderId(db, "project1_id", "env1_id", "folder1")).toBe("folder1_id");
    expect(getCachedFolderId(db, "project1_id", "env1_id", "folder2")).toBe("folder2_id");
  });

  test("it caches secrets successfully", () => {
    const SECRETS: SecretData[] = [
      {
        id: "secret1_id",
        key: "secret1_key",
        encryptedValue: "secret1_enc",
        scope: "client",
        valueType: "string",
      },
      {
        id: "secret2_id",
        key: "secret2_key",
        encryptedValue: "secret2_enc",
        scope: "client",
        valueType: "string",
      },
      {
        id: "secret3_id",
        key: "secret3_key",
        encryptedValue: "secret3_enc",
        scope: "client",
        valueType: "string",
      },
    ];

    const updatedAt = Date.now();
    cacheSecrets(db, "project1_id", "env1_id", "folder1_id", SECRETS, updatedAt);

    const secrets = getCachedSecrets(db, "project1_id", "env1_id", "folder1_id", undefined);

    expect(secrets).not.toBeNull();
    expect(secrets![0]).toBeDefined();
    expect(secrets![1]).toBeDefined();
    expect(secrets![2]).toBeDefined();

    const lastCachedAt = loadSecretsLastCachedTime(db, "project1_id", "env1_id", "folder1_id");

    expect(lastCachedAt).toBe(updatedAt);
  });

  test("it caches root-level secrets successfully", () => {
    const SECRETS: SecretData[] = [
      {
        id: "root_secret1_id",
        key: "ROOT_KEY_1",
        encryptedValue: "root_enc_1",
        scope: "server",
        valueType: "string",
      },
      {
        id: "root_secret2_id",
        key: "ROOT_KEY_2",
        encryptedValue: "root_enc_2",
        scope: "shared",
        valueType: "boolean",
      },
    ];

    const updatedAt = Date.now();
    cacheSecrets(db, "project1_id", "env1_id", undefined, SECRETS, updatedAt);

    const secrets = getCachedSecrets(db, "project1_id", "env1_id", undefined, undefined);

    expect(secrets).not.toBeNull();
    expect(secrets!.length).toBe(2);
    expect(secrets!.at(0)!.key).toBe("ROOT_KEY_1");
    expect(secrets!.at(1)!.key).toBe("ROOT_KEY_2");

    // NOTE: should not appear when querying with a folder
    const folderSecrets = getCachedSecrets(
      db,
      "project1_id",
      "env1_id",
      "some_folder_id",
      undefined,
    );
    expect(folderSecrets).toBeNull();

    const lastCachedAt = loadSecretsLastCachedTime(db, "project1_id", "env1_id", undefined);
    expect(lastCachedAt).toBe(updatedAt);
  });

  test("it caches project and fetches project key successfully", async () => {
    const projectId = "project_id_12345";
    const projectKey = "encrypted_project_key";

    cacheProject(db, projectId, projectKey);

    const result = loadCachedEncryptedProjectKey(db, projectId);

    expect(result).toBeDefined();
    expect(result).not.toBeNull();
    expect(result).toBe(projectKey);
  });

  test("it returns null if there is no project cached before", async () => {
    const projectId = "project_id_12345";

    const result = loadCachedEncryptedProjectKey(db, projectId);

    expect(result).toBeDefined();
    expect(result).toBeNull();
  });
});

describe("getGlobalCacheDbPath", () => {
  test("stores per-project caches under the user config directory", () => {
    const path = getGlobalCacheDbPath("proj_123");
    expect(path.endsWith(join("cache", "proj_123.db"))).toBe(true);
    expect(path.startsWith(getConfigDir())).toBe(true);
  });

  test("never lets a project id escape the cache directory", () => {
    const path = getGlobalCacheDbPath("../../etc/passwd");
    expect(basename(path)).toBe("______etc_passwd.db");
  });
});
