import { createProjectKey, decryptSecret, encryptSecret } from "@repo/crypto";
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, components, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { ErrorCode } from "../convex/lib/errors.ts";
import { SecretValueType } from "../convex/lib/types.ts";
import schema from "../convex/schema";
import {
  betterAuthModules,
  expectConvexError,
  getTestUsers,
  mockAutumn,
  modules,
  randomString,
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

describe("Secret Management", () => {
  let t: TestConvex<typeof schema>;
  let testUsers: TestUser[] = [];
  let owner: TestUser, collaborator: TestUser, nonCollaborator: TestUser;

  beforeEach(async () => {
    t = convexTest(schema, modules);

    const betterAuthSchema = await import("../convex/betterAuth/generatedSchema.ts");
    t.registerComponent("betterAuth", betterAuthSchema.default, betterAuthModules);

    testUsers = await getTestUsers(t);
    owner = testUsers[0]!;
    collaborator = testUsers[1]!;
    nonCollaborator = testUsers[2];
  });

  afterEach(() => {
    mockAutumn.reset();
  });

  describe("CRUD Operations", () => {
    beforeEach(async () => {
      mockAutumn.setFeature(owner.userId, "projects", 2);
      mockAutumn.setFeature(collaborator.userId, "projects", 2);
    });

    test("should create secrets with different primitive types", async () => {
      const { encryptedProjectKey, projectKey } = await createProjectKey(owner.publicKey!);

      const projectResult = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project_" + randomString(),
      });
      const projectId = assertProjectCreated(projectResult);

      const { id: environmentId } = await owner.asUser.mutation(api.environment.createEnvironment, {
        name: "environment_" + randomString(),
        projectId,
      });

      const valueTypes: ("string" | "number" | "boolean")[] = ["string", "number", "boolean"];
      const keys = ["key_1", "key_2", "key_3"];
      const values = ["hello", "1", "false"];

      const secretIds: Id<"secret">[] = [];

      let i = 0;
      for (i; i < 3; ++i) {
        const encryptedValue = await encryptSecret(projectKey, values[i]);

        const { id: secretId } = await owner.asUser.mutation(api.secret.createSecret, {
          encryptedValue,
          environmentId,
          key: keys[i],
          valueType: valueTypes[i],
          folderId: undefined,
        });

        secretIds.push(secretId);
      }

      i = 0;
      for (i; i < 3; ++i) {
        const { encryptedValue } = await owner.asUser.query(api.secret.getSecret, {
          secretId: secretIds[i],
        });

        const secretValue = await decryptSecret(projectKey, encryptedValue);
        expect(secretValue).toBe(values[i]);
      }
    });

    test("should delete cascade to folders", async () => {
      const { encryptedProjectKey, projectKey } = await createProjectKey(owner.publicKey!);

      const projectResult = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project_" + randomString(),
      });
      const projectId = assertProjectCreated(projectResult);

      const { id: environmentId } = await owner.asUser.mutation(api.environment.createEnvironment, {
        name: "environment_" + randomString(),
        projectId,
      });

      const { id: folderId } = await owner.asUser.mutation(api.folder.createFolder, {
        environmentId,
        name: "folder_" + randomString(),
      });

      const values = ["hello", "there", "how", "are", "you"];

      const secretIds: Id<"secret">[] = [];

      let i = 0;
      for (i; i < 3; ++i) {
        const encryptedValue = await encryptSecret(projectKey, values[i]);

        const { id: secretId } = await owner.asUser.mutation(api.secret.createSecret, {
          encryptedValue,
          environmentId,
          key: "key_" + randomString(),
          valueType: "string",
          folderId,
        });

        secretIds.push(secretId);
      }

      await expectConvexError(
        () =>
          owner.asUser.mutation(api.environment.deleteEnvironment, {
            environmentId,
          }),
        ErrorCode.CANNOT_DELETE_NON_EMPTY,
      );

      await expectConvexError(
        () =>
          owner.asUser.mutation(api.folder.deleteFolder, {
            folderId,
          }),
        ErrorCode.CANNOT_DELETE_NON_EMPTY,
      );

      i = 0;
      for (i; i < 3; ++i) {
        await owner.asUser.mutation(api.secret.deleteSecret, {
          secretId: secretIds[i],
        });
      }

      await owner.asUser.mutation(api.folder.deleteFolder, {
        folderId,
      });

      await owner.asUser.mutation(api.environment.deleteEnvironment, {
        environmentId,
      });

      await t.run(async (ctx) => {
        const environment = await ctx.db.get(environmentId);
        const folder = await ctx.db.get(folderId);

        expect(environment).toBeNull();
        expect(folder).toBeNull();
      });
    });

    test.skip("should move secrets between folders", async () => {});
  });

  describe("Scope Management", () => {
    beforeEach(async () => {
      mockAutumn.setFeature(owner.userId, "projects", 2);
    });

    test("should create secret with default shared scope", async () => {
      const { encryptedProjectKey, projectKey } = await createProjectKey(owner.publicKey!);

      const projectResult = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project_" + randomString(),
      });
      const projectId = assertProjectCreated(projectResult);

      const { id: environmentId } = await owner.asUser.mutation(api.environment.createEnvironment, {
        name: "environment_" + randomString(),
        projectId,
      });

      const encryptedValue = await encryptSecret(projectKey, "secret-value");

      const { id: secretId } = await owner.asUser.mutation(api.secret.createSecret, {
        encryptedValue,
        environmentId,
        key: "API_KEY",
        valueType: "string",
        folderId: undefined,
      });

      const secret = await owner.asUser.query(api.secret.getSecret, {
        secretId,
      });

      expect(secret.scope).toBe("shared");
    });

    test("should create secret with explicit client scope", async () => {
      const { encryptedProjectKey, projectKey } = await createProjectKey(owner.publicKey!);

      const projectResult = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project_" + randomString(),
      });
      const projectId = assertProjectCreated(projectResult);

      const { id: environmentId } = await owner.asUser.mutation(api.environment.createEnvironment, {
        name: "environment_" + randomString(),
        projectId,
      });

      const encryptedValue = await encryptSecret(projectKey, "public-api-key");

      const { id: secretId } = await owner.asUser.mutation(api.secret.createSecret, {
        encryptedValue,
        environmentId,
        key: "PUBLIC_API_KEY",
        valueType: "string",
        folderId: undefined,
        scope: "client",
      });

      const secret = await owner.asUser.query(api.secret.getSecret, {
        secretId,
      });

      expect(secret.scope).toBe("client");
    });

    test("should create secret with explicit server scope", async () => {
      const { encryptedProjectKey, projectKey } = await createProjectKey(owner.publicKey!);

      const projectResult = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project_" + randomString(),
      });
      const projectId = assertProjectCreated(projectResult);

      const { id: environmentId } = await owner.asUser.mutation(api.environment.createEnvironment, {
        name: "environment_" + randomString(),
        projectId,
      });

      const encryptedValue = await encryptSecret(projectKey, "database-password");

      const { id: secretId } = await owner.asUser.mutation(api.secret.createSecret, {
        encryptedValue,
        environmentId,
        key: "DB_PASSWORD",
        valueType: "string",
        folderId: undefined,
        scope: "server",
      });

      const secret = await owner.asUser.query(api.secret.getSecret, {
        secretId,
      });

      expect(secret.scope).toBe("server");
    });

    test("should update secret scope from server to client", async () => {
      const { encryptedProjectKey, projectKey } = await createProjectKey(owner.publicKey!);

      const projectResult = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project_" + randomString(),
      });
      const projectId = assertProjectCreated(projectResult);

      const { id: environmentId } = await owner.asUser.mutation(api.environment.createEnvironment, {
        name: "environment_" + randomString(),
        projectId,
      });

      const encryptedValue = await encryptSecret(projectKey, "initial-value");

      const { id: secretId } = await owner.asUser.mutation(api.secret.createSecret, {
        encryptedValue,
        environmentId,
        key: "CONFIGURABLE_KEY",
        valueType: "string",
        folderId: undefined,
        scope: "server",
      });

      const secretBefore = await owner.asUser.query(api.secret.getSecret, {
        secretId,
      });

      expect(secretBefore.scope).toBe("server");

      const newEncryptedValue = await encryptSecret(projectKey, "updated-value");

      await owner.asUser.mutation(api.secret.updateSecret, {
        secretId,
        updates: {
          encryptedValue: newEncryptedValue,
          valueType: SecretValueType.String,
          scope: "client",
        },
      });

      const secretAfter = await owner.asUser.query(api.secret.getSecret, {
        secretId,
      });

      expect(secretAfter.scope).toBe("client");
    });

    test("should update secret scope from client to server", async () => {
      const { encryptedProjectKey, projectKey } = await createProjectKey(owner.publicKey!);

      const projectResult = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project_" + randomString(),
      });
      const projectId = assertProjectCreated(projectResult);

      const { id: environmentId } = await owner.asUser.mutation(api.environment.createEnvironment, {
        name: "environment_" + randomString(),
        projectId,
      });

      const encryptedValue = await encryptSecret(projectKey, "public-key");

      const { id: secretId } = await owner.asUser.mutation(api.secret.createSecret, {
        encryptedValue,
        environmentId,
        key: "FEATURE_FLAG",
        valueType: "boolean",
        folderId: undefined,
        scope: "client",
      });

      const secretBefore = await owner.asUser.query(api.secret.getSecret, {
        secretId,
      });

      expect(secretBefore.scope).toBe("client");

      const newEncryptedValue = await encryptSecret(projectKey, "false");

      await owner.asUser.mutation(api.secret.updateSecret, {
        secretId,
        updates: {
          encryptedValue: newEncryptedValue,
          valueType: SecretValueType.Boolean,
          scope: "server",
        },
      });

      const secretAfter = await owner.asUser.query(api.secret.getSecret, {
        secretId,
      });

      expect(secretAfter.scope).toBe("server");
    });

    test("should preserve scope when updating other fields", async () => {
      const { encryptedProjectKey, projectKey } = await createProjectKey(owner.publicKey!);

      const projectResult = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project_" + randomString(),
      });
      const projectId = assertProjectCreated(projectResult);

      const { id: environmentId } = await owner.asUser.mutation(api.environment.createEnvironment, {
        name: "environment_" + randomString(),
        projectId,
      });

      const encryptedValue = await encryptSecret(projectKey, "original-value");

      const { id: secretId } = await owner.asUser.mutation(api.secret.createSecret, {
        encryptedValue,
        environmentId,
        key: "PRESERVE_SCOPE_TEST",
        valueType: "string",
        folderId: undefined,
        scope: "client",
      });

      const secretBefore = await owner.asUser.query(api.secret.getSecret, {
        secretId,
      });

      expect(secretBefore.scope).toBe("client");

      const newEncryptedValue = await encryptSecret(projectKey, "updated-value");

      await owner.asUser.mutation(api.secret.updateSecret, {
        secretId,
        updates: {
          encryptedValue: newEncryptedValue,
          valueType: SecretValueType.String,
        },
      });

      const secretAfter = await owner.asUser.query(api.secret.getSecret, {
        secretId,
      });

      expect(secretAfter.scope).toBe("client");
      const decryptedValue = await decryptSecret(projectKey, secretAfter.encryptedValue);
      expect(decryptedValue).toBe("updated-value");
    });

    test("should create multiple secrets with different scopes in same environment", async () => {
      const { encryptedProjectKey, projectKey } = await createProjectKey(owner.publicKey!);

      const projectResult = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project_" + randomString(),
      });
      const projectId = assertProjectCreated(projectResult);

      const { id: environmentId } = await owner.asUser.mutation(api.environment.createEnvironment, {
        name: "environment_" + randomString(),
        projectId,
      });

      const secrets = [
        { key: "CLIENT_KEY_1", scope: "client" as const, value: "client-value-1" },
        { key: "CLIENT_KEY_2", scope: "client" as const, value: "client-value-2" },
        { key: "SERVER_KEY_1", scope: "server" as const, value: "server-value-1" },
        { key: "SERVER_KEY_2", scope: "server" as const, value: "server-value-2" },
      ];

      const secretIds: Id<"secret">[] = [];

      for (const secret of secrets) {
        const encryptedValue = await encryptSecret(projectKey, secret.value);

        const { id: secretId } = await owner.asUser.mutation(api.secret.createSecret, {
          encryptedValue,
          environmentId,
          key: secret.key,
          valueType: "string",
          folderId: undefined,
          scope: secret.scope,
        });

        secretIds.push(secretId);
      }

      for (let i = 0; i < secrets.length; i++) {
        const retrievedSecret = await owner.asUser.query(api.secret.getSecret, {
          secretId: secretIds[i],
        });

        expect(retrievedSecret.scope).toBe(secrets[i].scope);
        expect(retrievedSecret.key).toBe(secrets[i].key);

        const decryptedValue = await decryptSecret(projectKey, retrievedSecret.encryptedValue);
        expect(decryptedValue).toBe(secrets[i].value);
      }
    });
  });

  describe("Bulk Update Optimization", () => {
    beforeEach(async () => {
      mockAutumn.setFeature(owner.userId, "projects", 2);
    });

    test("should not create action log for unchanged secrets in bulk update", async () => {
      const { encryptedProjectKey, projectKey } = await createProjectKey(owner.publicKey!);

      const projectResult = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project_" + randomString(),
      });
      const projectId = assertProjectCreated(projectResult);

      const { id: environmentId } = await owner.asUser.mutation(api.environment.createEnvironment, {
        name: "environment_" + randomString(),
        projectId,
      });

      // Create initial secrets
      const secret1Value = await encryptSecret(projectKey, "12345");
      const { id: secret1Id } = await owner.asUser.mutation(api.secret.createSecret, {
        encryptedValue: secret1Value,
        environmentId,
        key: "API_KEY",
        valueType: "string",
        folderId: undefined,
      });

      const secret2Value = await encryptSecret(projectKey, "old-value");
      const { id: secret2Id } = await owner.asUser.mutation(api.secret.createSecret, {
        encryptedValue: secret2Value,
        environmentId,
        key: "NAME",
        valueType: "string",
        folderId: undefined,
      });

      // Get initial action log count
      const logsBefore = await owner.asUser.action(api.actionLog.loadActionLogsByProject, {
        projectId,
        paginationOpts: { numItems: 100, cursor: null },
      });
      const initialLogCount = logsBefore.page.length;

      // Get current secret data to reuse unchanged encrypted value
      const secret1Data = await owner.asUser.query(api.secret.getSecret, {
        secretId: secret1Id,
      });

      // Bulk update: one unchanged (API_KEY with same encryptedValue), one changed (NAME=new-value)
      const changedValue = await encryptSecret(projectKey, "new-value");

      await owner.asUser.mutation(api.secret.updateSecretBulk, {
        environmentId,
        secrets: [
          {
            secretId: secret1Id,
            key: "API_KEY",
            encryptedValue: secret1Data.encryptedValue, // Reuse same encrypted value
            valueType: "string",
          },
          {
            secretId: secret2Id,
            key: "NAME",
            encryptedValue: changedValue,
            valueType: "string",
          },
        ],
        mode: "overwrite",
      });

      // Get action logs after bulk update
      const logsAfter = await owner.asUser.action(api.actionLog.loadActionLogsByProject, {
        projectId,
        paginationOpts: { numItems: 100, cursor: null },
      });

      // Should only have 1 new action log (for the changed secret)
      // Initial: 2 creates + 1 update (for NAME) = 3 total
      expect(logsAfter.page.length).toBe(initialLogCount + 1);

      // Verify the new log is for the updated secret
      const newLog = logsAfter.page[0];
      expect(newLog?.action).toBe("secret.updated");
      expect(newLog?.metadata?.key).toBe("NAME");
    });

    test("should not update database for unchanged secrets in bulk update", async () => {
      const { encryptedProjectKey, projectKey } = await createProjectKey(owner.publicKey!);

      const projectResult = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project_" + randomString(),
      });
      const projectId = assertProjectCreated(projectResult);

      const { id: environmentId } = await owner.asUser.mutation(api.environment.createEnvironment, {
        name: "environment_" + randomString(),
        projectId,
      });

      // Create a secret
      const initialValue = await encryptSecret(projectKey, "test-value");
      const { id: secretId } = await owner.asUser.mutation(api.secret.createSecret, {
        encryptedValue: initialValue,
        environmentId,
        key: "TEST_KEY",
        valueType: "string",
        folderId: undefined,
      });

      // Get the secret before bulk update
      const secretBefore = await owner.asUser.query(api.secret.getSecret, {
        secretId,
      });

      // Bulk update with same value (same encrypted value)
      const result = await owner.asUser.mutation(api.secret.updateSecretBulk, {
        environmentId,
        secrets: [
          {
            secretId,
            key: "TEST_KEY",
            encryptedValue: secretBefore.encryptedValue,
            valueType: "string",
          },
        ],
        mode: "overwrite",
      });

      // Verify result shows 0 updates
      expect(result.updatedCount).toBe(0);
      expect(result.createdCount).toBe(0);
      expect(result.skippedCount).toBe(0);

      // Get the secret after bulk update
      const secretAfter = await owner.asUser.query(api.secret.getSecret, {
        secretId,
      });

      // Verify updatedAt timestamp hasn't changed
      expect(secretAfter.updatedAt).toBe(secretBefore.updatedAt);
    });
  });
});
