import {
  createProjectKey,
  decryptSecret,
  encryptSecret,
  importPublicKey,
  unwrapAESKeyWithRSA,
  wrapAESKeyWithRSA,
} from "@repo/crypto";
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { ErrorCode } from "../convex/lib/errors.ts";
import { SecretValueType } from "../convex/lib/types.ts";
import schema from "../convex/schema";
import { historyRetention } from "../convex/secretHistory.ts";
import {
  betterAuthModules,
  expectConvexError,
  getTestUsers,
  mockBilling,
  modules,
  randomString,
  setPlan,
  type TestUser,
} from "./setup";

function assertProjectCreated(result: {
  status: string;
  projectId?: string;
  message?: string;
}): Id<"project"> {
  if (result.status !== "success" || !result.projectId) {
    throw new Error(`Project creation failed: ${result.message || "Unknown error"}`);
  }
  return result.projectId as Id<"project">;
}

describe("Secret History", () => {
  let t: TestConvex<typeof schema>;
  let owner: TestUser, collaborator: TestUser, nonCollaborator: TestUser;
  let projectId: Id<"project">;
  let projectKey: CryptoKey;
  let environmentId: Id<"environment">;
  let environmentName: string;

  beforeEach(async () => {
    t = convexTest(schema, modules);

    const betterAuthSchema = await import("../convex/betterAuth/generatedSchema.ts");
    t.registerComponent("betterAuth", betterAuthSchema.default, betterAuthModules);

    const testUsers = await getTestUsers(t, 3);
    owner = testUsers[0]!;
    collaborator = testUsers[1]!;
    nonCollaborator = testUsers[2]!;

    const { encryptedProjectKey } = await createProjectKey(owner.publicKey!);
    const result = await owner.asUser.action(api.project.createProject, {
      encryptedProjectKey,
      name: "history-project-" + randomString(),
    });
    projectId = assertProjectCreated(result);
    projectKey = await unwrapAESKeyWithRSA(encryptedProjectKey, owner.privateKey!);

    environmentName = "production";
    const env = await owner.asUser.mutation(api.environment.createEnvironment, {
      projectId,
      name: environmentName,
    });
    environmentId = env.id;
  });

  afterEach(() => {
    mockBilling.reset();
  });

  async function shareWithCollaborator() {
    await setPlan(t, owner.userId, "pro");
    const collaboratorPublicKey = await importPublicKey(collaborator.publicKey!);
    const result = await owner.asUser.action(api.projectShare.shareProject, {
      projectId,
      userEmail: collaborator.email,
      encryptedProjectKey: await wrapAESKeyWithRSA(projectKey, collaboratorPublicKey),
    });
    if (!result.success) {
      throw new Error(`Share failed: ${result.message || "Unknown error"}`);
    }
  }

  async function createSecret(key: string, value: string, folderId?: Id<"folder">) {
    const { id } = await owner.asUser.mutation(api.secret.createSecret, {
      environmentId,
      folderId,
      key,
      encryptedValue: await encryptSecret(projectKey, value),
      valueType: "string",
    });
    return id;
  }

  async function updateValue(user: TestUser, secretId: Id<"secret">, value: string) {
    await user.asUser.mutation(api.secret.updateSecret, {
      secretId,
      updates: {
        encryptedValue: await encryptSecret(projectKey, value),
        valueType: SecretValueType.String,
      },
    });
  }

  describe("Recording versions", () => {
    test("legacy secrets without history report version 1 and no entries", async () => {
      const secretId = await createSecret("API_KEY", "v1");

      const history = await owner.asUser.query(api.secretHistory.getSecretHistory, { secretId });

      expect(history.versions).toHaveLength(0);
      expect(history.secret.currentVersion).toBe(1);
      expect(history.secret.isDeleted).toBe(false);
      expect(history.retentionLimit).toBe(historyRetention.free);
      expect(await decryptSecret(projectKey, history.secret.encryptedValue!)).toBe("v1");
    });

    test("updates keep the previous ciphertext with sequential versions", async () => {
      const secretId = await createSecret("API_KEY", "first");
      await updateValue(owner, secretId, "second");
      await updateValue(owner, secretId, "third");

      const history = await owner.asUser.query(api.secretHistory.getSecretHistory, { secretId });

      expect(history.secret.currentVersion).toBe(3);
      expect(history.versions.map((entry) => entry.version)).toEqual([2, 1]);
      expect(history.versions.every((entry) => entry.changeType === "updated")).toBe(true);
      expect(history.versions[0]?.changedBy).toBe(owner.userId);
      expect(history.versions[0]?.changedByEmail).toBe(owner.email);

      const decrypted = await Promise.all(
        history.versions.map((entry) => decryptSecret(projectKey, entry.encryptedValue)),
      );
      expect(decrypted).toEqual(["second", "first"]);
      expect(await decryptSecret(projectKey, history.secret.encryptedValue!)).toBe("third");
    });

    test("no-op updates do not add history", async () => {
      const secretId = await createSecret("API_KEY", "same");
      const secret = await owner.asUser.query(api.secret.getSecret, { secretId });

      await owner.asUser.mutation(api.secret.updateSecret, {
        secretId,
        updates: { encryptedValue: secret.encryptedValue, valueType: SecretValueType.String },
      });

      const history = await owner.asUser.query(api.secretHistory.getSecretHistory, { secretId });
      expect(history.versions).toHaveLength(0);
    });

    test("bulk updates record history only for changed secrets", async () => {
      const changedId = await createSecret("CHANGED", "old");
      const unchangedId = await createSecret("UNCHANGED", "keep");
      const unchanged = await owner.asUser.query(api.secret.getSecret, { secretId: unchangedId });

      await owner.asUser.mutation(api.secret.updateSecretBulk, {
        environmentId,
        secrets: [
          {
            secretId: changedId,
            key: "CHANGED",
            encryptedValue: await encryptSecret(projectKey, "new"),
            valueType: "string",
          },
          {
            secretId: unchangedId,
            key: "UNCHANGED",
            encryptedValue: unchanged.encryptedValue,
            valueType: "string",
          },
          {
            key: "BRAND_NEW",
            encryptedValue: await encryptSecret(projectKey, "fresh"),
            valueType: "string",
          },
        ],
        mode: "overwrite",
      });

      const changedHistory = await owner.asUser.query(api.secretHistory.getSecretHistory, {
        secretId: changedId,
      });
      const unchangedHistory = await owner.asUser.query(api.secretHistory.getSecretHistory, {
        secretId: unchangedId,
      });

      expect(changedHistory.versions).toHaveLength(1);
      expect(await decryptSecret(projectKey, changedHistory.versions[0]!.encryptedValue)).toBe(
        "old",
      );
      expect(unchangedHistory.versions).toHaveLength(0);

      const allEntries = await t.run((ctx) => ctx.db.query("secretHistory").collect());
      expect(allEntries).toHaveLength(1);
    });

    test("deletes move the value into history and scrub the secret row", async () => {
      const secretId = await createSecret("API_KEY", "doomed");

      await owner.asUser.mutation(api.secret.deleteSecret, { secretId });

      const row = await t.run((ctx) => ctx.db.get(secretId));
      expect(row?.isDeleted).toBe(true);
      expect(row?.encryptedValue).toBe("");

      const history = await owner.asUser.query(api.secretHistory.getSecretHistory, { secretId });
      expect(history.secret.isDeleted).toBe(true);
      expect(history.secret.currentVersion).toBeNull();
      expect(history.secret.encryptedValue).toBeNull();
      expect(history.versions).toHaveLength(1);
      expect(history.versions[0]?.changeType).toBe("deleted");
      expect(await decryptSecret(projectKey, history.versions[0]!.encryptedValue)).toBe("doomed");
    });

    test("stores location, scope, value type, and key version with each entry", async () => {
      const { id: folderId } = await owner.asUser.mutation(api.folder.createFolder, {
        environmentId,
        name: "database",
      });
      const { id: secretId } = await owner.asUser.mutation(api.secret.createSecret, {
        environmentId,
        folderId,
        key: "DB_PORT",
        encryptedValue: await encryptSecret(projectKey, "5432"),
        valueType: "number",
        scope: "server",
      });

      await owner.asUser.mutation(api.secret.updateSecret, {
        secretId,
        updates: {
          encryptedValue: await encryptSecret(projectKey, "6543"),
          valueType: SecretValueType.Number,
          scope: "server",
        },
      });

      const entries = await t.run((ctx) => ctx.db.query("secretHistory").collect());
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        secretId,
        projectId,
        environmentId,
        folderId,
        key: "DB_PORT",
        version: 1,
        valueType: "number",
        scope: "server",
        encryptionKeyVersion: 1,
        changeType: "updated",
        changedBy: owner.userId,
      });
    });
  });

  describe("Retention", () => {
    test("keeps only the newest versions on the free plan", async () => {
      const secretId = await createSecret("API_KEY", "value-0");

      for (let i = 1; i <= historyRetention.free + 3; i++) {
        await updateValue(owner, secretId, `value-${i}`);
      }

      const history = await owner.asUser.query(api.secretHistory.getSecretHistory, { secretId });

      expect(history.versions).toHaveLength(historyRetention.free);
      expect(history.versions[0]?.version).toBe(historyRetention.free + 3);
      expect(history.versions.at(-1)?.version).toBe(4);
      expect(history.secret.currentVersion).toBe(historyRetention.free + 4);
    });

    test("uses the owner's Pro retention limit", async () => {
      await setPlan(t, owner.userId, "pro");

      const secretId = await createSecret("API_KEY", "value-0");
      for (let i = 1; i <= historyRetention.free + 2; i++) {
        await updateValue(owner, secretId, `value-${i}`);
      }

      const history = await owner.asUser.query(api.secretHistory.getSecretHistory, { secretId });
      expect(history.retentionLimit).toBe(historyRetention.pro);
      expect(history.versions).toHaveLength(historyRetention.free + 2);
    });
  });

  describe("Rollback", () => {
    test("restores an older version as the new current value and records the restore", async () => {
      const secretId = await createSecret("API_KEY", "first");
      await updateValue(owner, secretId, "second");
      await updateValue(owner, secretId, "third");

      const result = await owner.asUser.mutation(api.secretHistory.restoreSecretVersion, {
        secretId,
        version: 1,
      });
      expect(result).toEqual({ success: true, restoredVersion: 1, wasDeleted: false });

      const secret = await owner.asUser.query(api.secret.getSecret, { secretId });
      expect(await decryptSecret(projectKey, secret.encryptedValue)).toBe("first");

      const history = await owner.asUser.query(api.secretHistory.getSecretHistory, { secretId });
      expect(history.secret.currentVersion).toBe(4);
      expect(history.versions[0]?.version).toBe(3);
      expect(history.versions[0]?.changeType).toBe("restored");
      expect(await decryptSecret(projectKey, history.versions[0]!.encryptedValue)).toBe("third");

      const logs = await owner.asUser.query(api.actionLog.loadActionLogsByProject, {
        projectId,
        paginationOpts: { numItems: 10, cursor: null },
      });
      expect(logs.page[0]?.action).toBe("secret.restored");
      expect(logs.page[0]?.metadata).toMatchObject({
        key: "API_KEY",
        restoredVersion: 1,
        wasDeleted: false,
      });
    });

    test("restores value type and scope along with the value", async () => {
      const { id: secretId } = await owner.asUser.mutation(api.secret.createSecret, {
        environmentId,
        key: "FLAG",
        encryptedValue: await encryptSecret(projectKey, "true"),
        valueType: "boolean",
        scope: "client",
      });

      await owner.asUser.mutation(api.secret.updateSecret, {
        secretId,
        updates: {
          encryptedValue: await encryptSecret(projectKey, "enabled"),
          valueType: SecretValueType.String,
          scope: "server",
        },
      });

      await owner.asUser.mutation(api.secretHistory.restoreSecretVersion, { secretId, version: 1 });

      const secret = await owner.asUser.query(api.secret.getSecret, { secretId });
      expect(secret.valueType).toBe("boolean");
      expect(secret.scope).toBe("client");
    });

    test("restores a deleted secret", async () => {
      const secretId = await createSecret("API_KEY", "came-back");
      await owner.asUser.mutation(api.secret.deleteSecret, { secretId });

      const result = await owner.asUser.mutation(api.secretHistory.restoreSecretVersion, {
        secretId,
        version: 1,
      });
      expect(result.wasDeleted).toBe(true);

      const env = await owner.asUser.query(api.environment.getEnvironmentData, { environmentId });
      expect(env.secrets.map((s) => s.key)).toEqual(["API_KEY"]);
      expect(await decryptSecret(projectKey, env.secrets[0]!.encryptedValue)).toBe("came-back");

      const history = await owner.asUser.query(api.secretHistory.getSecretHistory, { secretId });
      expect(history.secret.isDeleted).toBe(false);
      expect(history.secret.currentVersion).toBe(2);

      const logs = await owner.asUser.query(api.actionLog.loadActionLogsByProject, {
        projectId,
        paginationOpts: { numItems: 10, cursor: null },
      });
      expect(logs.page[0]?.action).toBe("secret.restored");
      expect(logs.page[0]?.metadata?.wasDeleted).toBe(true);
    });

    test("refuses to restore a deleted secret over a newer secret with the same key", async () => {
      const secretId = await createSecret("API_KEY", "old");
      await owner.asUser.mutation(api.secret.deleteSecret, { secretId });
      await createSecret("API_KEY", "replacement");

      await expectConvexError(
        () =>
          owner.asUser.mutation(api.secretHistory.restoreSecretVersion, { secretId, version: 1 }),
        ErrorCode.RESOURCE_ALREADY_EXISTS,
      );
    });

    test("fails for unknown versions", async () => {
      const secretId = await createSecret("API_KEY", "only");

      await expectConvexError(
        () =>
          owner.asUser.mutation(api.secretHistory.restoreSecretVersion, { secretId, version: 7 }),
        ErrorCode.SECRET_NOT_FOUND,
      );
    });
  });

  describe("Lookup by key", () => {
    test("finds the active secret by environment and folder name", async () => {
      const { id: folderId } = await owner.asUser.mutation(api.folder.createFolder, {
        environmentId,
        name: "database",
      });
      await createSecret("URL", "root");
      const folderSecretId = await createSecret("URL", "in-folder", folderId);
      await updateValue(owner, folderSecretId, "in-folder-2");

      const history = await owner.asUser.query(api.secretHistory.getSecretHistoryByKey, {
        projectId,
        environmentName,
        folderName: "database",
        key: "URL",
      });

      expect(history.secret.id).toBe(folderSecretId);
      expect(history.versions).toHaveLength(1);
      expect(history.encryptedProjectKey).toBeDefined();
    });

    test("falls back to the most recently deleted secret with that key", async () => {
      const secretId = await createSecret("GONE", "bye");
      await owner.asUser.mutation(api.secret.deleteSecret, { secretId });

      const history = await owner.asUser.query(api.secretHistory.getSecretHistoryByKey, {
        projectId,
        environmentName,
        key: "GONE",
      });

      expect(history.secret.id).toBe(secretId);
      expect(history.secret.isDeleted).toBe(true);
    });

    test("returns the caller's wrapped project key", async () => {
      await shareWithCollaborator();
      await createSecret("API_KEY", "value");

      const history = await collaborator.asUser.query(api.secretHistory.getSecretHistoryByKey, {
        projectId,
        environmentName,
        key: "API_KEY",
      });

      const collaboratorKey = await unwrapAESKeyWithRSA(
        history.encryptedProjectKey,
        collaborator.privateKey!,
      );
      expect(await decryptSecret(collaboratorKey, history.secret.encryptedValue!)).toBe("value");
    });

    test("fails when the key does not exist", async () => {
      await expectConvexError(
        () =>
          owner.asUser.query(api.secretHistory.getSecretHistoryByKey, {
            projectId,
            environmentName,
            key: "MISSING",
          }),
        ErrorCode.SECRET_NOT_FOUND,
      );
    });
  });

  describe("Access control", () => {
    test("collaborators can read history and roll back", async () => {
      await shareWithCollaborator();
      const secretId = await createSecret("API_KEY", "first");
      await updateValue(collaborator, secretId, "second");

      const history = await collaborator.asUser.query(api.secretHistory.getSecretHistory, {
        secretId,
      });
      expect(history.versions[0]?.changedBy).toBe(collaborator.userId);

      await collaborator.asUser.mutation(api.secretHistory.restoreSecretVersion, {
        secretId,
        version: 1,
      });
      const secret = await owner.asUser.query(api.secret.getSecret, { secretId });
      expect(await decryptSecret(projectKey, secret.encryptedValue)).toBe("first");
    });

    test("non-members cannot read history or roll back", async () => {
      const secretId = await createSecret("API_KEY", "first");
      await updateValue(owner, secretId, "second");

      await expectConvexError(
        () => nonCollaborator.asUser.query(api.secretHistory.getSecretHistory, { secretId }),
        ErrorCode.INSUFFICIENT_PERMISSION,
      );
      await expectConvexError(
        () =>
          nonCollaborator.asUser.query(api.secretHistory.getSecretHistoryByKey, {
            projectId,
            environmentName,
            key: "API_KEY",
          }),
        ErrorCode.INSUFFICIENT_PERMISSION,
      );
      await expectConvexError(
        () =>
          nonCollaborator.asUser.mutation(api.secretHistory.restoreSecretVersion, {
            secretId,
            version: 1,
          }),
        ErrorCode.INSUFFICIENT_PERMISSION,
      );
    });

    test("revoked collaborators lose access to history", async () => {
      await shareWithCollaborator();
      const secretId = await createSecret("API_KEY", "first");
      await updateValue(owner, secretId, "second");

      const share = await collaborator.asUser.query(
        api.projectShare.getProjectShareByProjectForCurrentUser,
        { projectId },
      );
      await owner.asUser.action(api.projectShare.revokeShare, { shareId: share.id });

      await expectConvexError(
        () => collaborator.asUser.query(api.secretHistory.getSecretHistory, { secretId }),
        ErrorCode.INSUFFICIENT_PERMISSION,
      );
    });

    test("only the owner can fetch history for rotation", async () => {
      await shareWithCollaborator();

      await expectConvexError(
        () =>
          collaborator.asUser.query(api.secretHistory.getSecretHistoryForRotation, {
            projectId,
            paginationOpts: { numItems: 100, cursor: null },
          }),
        ErrorCode.INSUFFICIENT_PERMISSION,
      );
    });
  });

  describe("Key rotation", () => {
    async function rotateWithRevocation(options: { includeHistory: boolean; skip?: number }) {
      const share = await collaborator.asUser.query(
        api.projectShare.getProjectShareByProjectForCurrentUser,
        { projectId },
      );

      const { encryptedProjectKey: newEncryptedProjectKey, projectKey: newProjectKey } =
        await createProjectKey(owner.publicKey!);

      const secrets = await owner.asUser.query(api.secret.getAllSecretsForProject, { projectId });
      const reEncryptedSecrets = await Promise.all(
        secrets.map(async (secret) => ({
          secretId: secret.id,
          newEncryptedValue: await encryptSecret(
            newProjectKey,
            await decryptSecret(projectKey, secret.encryptedValue),
          ),
        })),
      );

      const historyPage = await owner.asUser.query(api.secretHistory.getSecretHistoryForRotation, {
        projectId,
        paginationOpts: { numItems: 100, cursor: null },
      });
      const reEncryptedHistory = await Promise.all(
        historyPage.page.slice(options.skip ?? 0).map(async (entry) => ({
          historyId: entry.id,
          newEncryptedValue: await encryptSecret(
            newProjectKey,
            await decryptSecret(projectKey, entry.encryptedValue),
          ),
        })),
      );

      await owner.asUser.action(api.projectShare.revokeShareWithRotation, {
        shareId: share.id,
        newEncryptedProjectKey,
        rewrappedShares: [],
        reEncryptedSecrets,
        reEncryptedHistory: options.includeHistory ? reEncryptedHistory : undefined,
      });

      return newProjectKey;
    }

    test("re-encrypts history with the new project key on the owner's device", async () => {
      await shareWithCollaborator();
      const secretId = await createSecret("API_KEY", "first");
      await updateValue(owner, secretId, "second");
      const deletedId = await createSecret("OLD_TOKEN", "deleted-value");
      await owner.asUser.mutation(api.secret.deleteSecret, { secretId: deletedId });

      const oldProjectKey = projectKey;
      const newProjectKey = await rotateWithRevocation({ includeHistory: true });

      const history = await owner.asUser.query(api.secretHistory.getSecretHistory, { secretId });
      expect(history.versions).toHaveLength(1);
      expect(history.versions[0]?.encryptionKeyVersion).toBe(2);
      expect(await decryptSecret(newProjectKey, history.versions[0]!.encryptedValue)).toBe("first");
      await expect(
        decryptSecret(oldProjectKey, history.versions[0]!.encryptedValue),
      ).rejects.toThrow();

      projectKey = newProjectKey;
      await owner.asUser.mutation(api.secretHistory.restoreSecretVersion, {
        secretId: deletedId,
        version: 1,
      });
      const restored = await owner.asUser.query(api.secret.getSecret, { secretId: deletedId });
      expect(await decryptSecret(newProjectKey, restored.encryptedValue)).toBe("deleted-value");

      const rotation = await t.run((ctx) => ctx.db.query("keyRotation").first());
      expect(rotation?.historyReEncrypted).toBe(2);
      expect(rotation?.historyPurged).toBe(0);
    });

    test("purges history the client did not re-encrypt", async () => {
      await shareWithCollaborator();
      const firstId = await createSecret("FIRST", "a");
      await updateValue(owner, firstId, "b");
      const secondId = await createSecret("SECOND", "c");
      await updateValue(owner, secondId, "d");

      await rotateWithRevocation({ includeHistory: true, skip: 1 });

      const remaining = await t.run((ctx) => ctx.db.query("secretHistory").collect());
      expect(remaining).toHaveLength(1);
      expect(remaining[0]?.encryptionKeyVersion).toBe(2);

      const logs = await owner.asUser.query(api.actionLog.loadActionLogsByProject, {
        projectId,
        paginationOpts: { numItems: 5, cursor: null },
      });
      const revokeLog = logs.page.find((log) => log.action === "share.revoked");
      expect(revokeLog?.metadata).toMatchObject({ historyReEncrypted: 1, historyPurged: 1 });
    });

    test("purges all history when an older client rotates without sending history", async () => {
      await shareWithCollaborator();
      const secretId = await createSecret("API_KEY", "first");
      await updateValue(owner, secretId, "second");

      await rotateWithRevocation({ includeHistory: false });

      const remaining = await t.run((ctx) => ctx.db.query("secretHistory").collect());
      expect(remaining).toHaveLength(0);
    });

    test("scrubs ciphertext left on legacy soft-deleted secrets", async () => {
      await shareWithCollaborator();
      const legacyDeletedId = await t.run(async (ctx) => {
        const now = Date.now();
        return await ctx.db.insert("secret", {
          projectId,
          environmentId,
          key: "LEGACY_DELETED",
          encryptedValue: await encryptSecret(projectKey, "legacy"),
          valueType: "string",
          scope: "shared",
          encryptionKeyVersion: 1,
          isDeleted: true,
          createdBy: owner.userId,
          createdAt: now,
          updatedBy: owner.userId,
          updatedAt: now,
        });
      });

      await rotateWithRevocation({ includeHistory: true });

      const row = await t.run((ctx) => ctx.db.get(legacyDeletedId));
      expect(row?.encryptedValue).toBe("");
    });

    test("rejects history entries from another project", async () => {
      await shareWithCollaborator();

      const otherProject = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey: (await createProjectKey(owner.publicKey!)).encryptedProjectKey,
        name: "other-" + randomString(),
      });
      const otherProjectId = assertProjectCreated(otherProject);
      const { id: otherEnvironmentId } = await owner.asUser.mutation(
        api.environment.createEnvironment,
        { projectId: otherProjectId, name: "dev" },
      );
      const { id: otherSecretId } = await owner.asUser.mutation(api.secret.createSecret, {
        environmentId: otherEnvironmentId,
        key: "OTHER",
        encryptedValue: "ciphertext",
        valueType: "string",
      });
      await owner.asUser.mutation(api.secret.updateSecret, {
        secretId: otherSecretId,
        updates: { encryptedValue: "ciphertext-2", valueType: SecretValueType.String },
      });
      const foreignEntry = await t.run((ctx) => ctx.db.query("secretHistory").first());

      const share = await collaborator.asUser.query(
        api.projectShare.getProjectShareByProjectForCurrentUser,
        { projectId },
      );

      await expectConvexError(
        () =>
          owner.asUser.action(api.projectShare.revokeShareWithRotation, {
            shareId: share.id,
            newEncryptedProjectKey: "new-key",
            rewrappedShares: [],
            reEncryptedSecrets: [],
            reEncryptedHistory: [{ historyId: foreignEntry!._id, newEncryptedValue: "evil" }],
          }),
        ErrorCode.INVALID_OPERATION,
      );

      const untouched = await t.run((ctx) => ctx.db.get(foreignEntry!._id));
      expect(untouched?.encryptedValue).toBe("ciphertext");
    });

    test("refuses to restore versions encrypted with a retired key", async () => {
      const secretId = await createSecret("API_KEY", "first");
      await updateValue(owner, secretId, "second");

      await t.run(async (ctx) => {
        await ctx.db.patch(projectId, { keyVersion: 2 });
      });

      await expectConvexError(
        () =>
          owner.asUser.mutation(api.secretHistory.restoreSecretVersion, { secretId, version: 1 }),
        ErrorCode.INVALID_RESOURCE_STATE,
      );
    });
  });

  describe("Cleanup", () => {
    test("deleting a folder or environment removes its history", async () => {
      const { id: folderId } = await owner.asUser.mutation(api.folder.createFolder, {
        environmentId,
        name: "auth",
      });
      const folderSecretId = await createSecret("TOKEN", "a", folderId);
      await owner.asUser.mutation(api.secret.deleteSecret, { secretId: folderSecretId });
      const rootSecretId = await createSecret("ROOT", "b");
      await owner.asUser.mutation(api.secret.deleteSecret, { secretId: rootSecretId });

      await owner.asUser.mutation(api.folder.deleteFolder, { folderId });
      let entries = await t.run((ctx) => ctx.db.query("secretHistory").collect());
      expect(entries.map((entry) => entry.key)).toEqual(["ROOT"]);

      await owner.asUser.mutation(api.environment.deleteEnvironment, { environmentId });
      entries = await t.run((ctx) => ctx.db.query("secretHistory").collect());
      expect(entries).toHaveLength(0);
    });
  });
});
