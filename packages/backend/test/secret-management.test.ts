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

const STALE_PROJECT_KEY_MESSAGE = "The project key changed. Reload the project and try again.";

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
    mockBilling.reset();
  });

  describe("CRUD Operations", () => {
    beforeEach(async () => {
      await setPlan(t, owner.userId, "pro");
      await setPlan(t, collaborator.userId, "pro");
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
      await setPlan(t, owner.userId, "pro");
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
      await setPlan(t, owner.userId, "pro");
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
      const logsBefore = await owner.asUser.query(api.actionLog.loadActionLogsByProject, {
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
      const logsAfter = await owner.asUser.query(api.actionLog.loadActionLogsByProject, {
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

    test("should export secrets successfully", async () => {
      const { encryptedProjectKey } = await createProjectKey(owner.publicKey!);

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
        environmentId: environmentId,
        name: "folder_" + randomString(),
      });

      for (let i = 0; i < 50; i++) {
        await owner.asUser.mutation(api.secret.createSecret, {
          encryptedValue: "encrypted-value",
          environmentId,
          folderId,
          key: "test_" + randomString(),
          scope: "client",
          valueType: "string",
        });
      }

      for (let i = 0; i < 10; i++) {
        await owner.asUser.mutation(api.secret.createSecret, {
          encryptedValue: "encrypted-value",
          environmentId,
          folderId,
          key: "test_" + randomString(),
          scope: "server",
          valueType: "string",
        });
      }

      const clientSecrets = await owner.asUser.mutation(api.secret.exportSecrets, {
        environmentId,
        projectId,
        folderId,
        scope: "client",
      });

      expect(clientSecrets.count).toBe(50);

      const serverSecrets = await owner.asUser.mutation(api.secret.exportSecrets, {
        environmentId,
        projectId,
        folderId,
        scope: "server",
      });

      expect(serverSecrets.count).toBe(10);

      const allSecrets = await owner.asUser.mutation(api.secret.exportSecrets, {
        environmentId,
        projectId,
        folderId,
      });

      expect(allSecrets.count).toBe(60);
      expect(allSecrets.encryptedProjectKey).toBeDefined();
    });

    test("should fail when environment doesn't belong to project", async () => {
      const { encryptedProjectKey } = await createProjectKey(owner.publicKey!);

      const project1Result = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project_" + randomString(),
      });
      const project1Id = assertProjectCreated(project1Result);

      const project2Result = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project_" + randomString(),
      });
      const project2Id = assertProjectCreated(project2Result);

      const { id: environmentFromProject2Id } = await owner.asUser.mutation(
        api.environment.createEnvironment,
        {
          name: "environment_" + randomString(),
          projectId: project2Id,
        },
      );

      await expectConvexError(
        () =>
          owner.asUser.mutation(api.secret.exportSecrets, {
            projectId: project1Id,
            environmentId: environmentFromProject2Id,
          }),
        ErrorCode.INVALID_ARGUMENTS,
      );
    });

    test("should deny access to non-shared user", async () => {
      const { encryptedProjectKey } = await createProjectKey(owner.publicKey!);

      const projectResult = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project_" + randomString(),
      });
      const projectId = assertProjectCreated(projectResult);

      const { id: environmentId } = await owner.asUser.mutation(api.environment.createEnvironment, {
        name: "environment_" + randomString(),
        projectId,
      });

      await expectConvexError(
        () =>
          nonCollaborator.asUser.mutation(api.secret.exportSecrets, {
            projectId,
            environmentId,
          }),
        ErrorCode.INSUFFICIENT_PERMISSION,
      );
    });

    test("should export secrets by environment name", async () => {
      const { encryptedProjectKey } = await createProjectKey(owner.publicKey!);

      const projectResult = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project_" + randomString(),
      });
      const projectId = assertProjectCreated(projectResult);

      const environmentName = "environment_" + randomString();
      const { id: environmentId } = await owner.asUser.mutation(api.environment.createEnvironment, {
        projectId,
        name: environmentName,
      });

      const folderName = "folder_" + randomString();
      const { id: folderId } = await owner.asUser.mutation(api.folder.createFolder, {
        environmentId,
        name: folderName,
      });

      for (let i = 0; i < 5; i++) {
        await owner.asUser.mutation(api.secret.createSecret, {
          encryptedValue: "encrypted-value",
          environmentId,
          folderId,
          key: "test_" + randomString(),
          scope: "client",
          valueType: "string",
        });
      }

      const result = await owner.asUser.mutation(api.secret.exportSecrets, {
        projectId,
        environmentName,
        folderName,
      });

      expect(result.count).toBe(5);
      expect(result.secrets).toHaveLength(5);
      expect(result.encryptedProjectKey).toBeDefined();
    });

    test("should record a secrets.pushed log when exporting for a push", async () => {
      const { encryptedProjectKey } = await createProjectKey(owner.publicKey!);

      const projectResult = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project_" + randomString(),
      });
      const projectId = assertProjectCreated(projectResult);

      const { id: environmentId } = await owner.asUser.mutation(api.environment.createEnvironment, {
        projectId,
        name: "environment_" + randomString(),
      });

      for (const scope of ["client", "server", "shared"] as const) {
        await owner.asUser.mutation(api.secret.createSecret, {
          encryptedValue: "encrypted-value",
          environmentId,
          key: `${scope.toUpperCase()}_KEY`,
          scope,
          valueType: "string",
        });
      }

      const result = await owner.asUser.mutation(api.secret.exportSecrets, {
        projectId,
        environmentId,
        push: { target: "vercel", destination: "prj_123 (production)" },
      });
      expect(result.count).toBe(3);

      const scoped = await owner.asUser.mutation(api.secret.exportSecrets, {
        projectId,
        environmentId,
        scopes: ["client", "shared"],
        push: { target: "cloudflare", destination: "my-worker", dryRun: true },
      });
      expect(scoped.secrets.map((s) => s.key).sort()).toEqual(["CLIENT_KEY", "SHARED_KEY"]);

      const logs = await owner.asUser.action(api.actionLog.loadActionLogsByProject, {
        projectId,
        paginationOpts: { numItems: 10, cursor: null },
      });

      const [dryRunLog, pushLog] = logs.page;
      expect(dryRunLog?.action).toBe("secrets.pushed");
      expect(dryRunLog?.metadata).toMatchObject({
        pushTarget: "cloudflare",
        pushDestination: "my-worker",
        pushDryRun: true,
        exportCount: 2,
      });
      expect(pushLog?.action).toBe("secrets.pushed");
      expect(pushLog?.metadata).toMatchObject({
        pushTarget: "vercel",
        pushDestination: "prj_123 (production)",
        exportCount: 3,
      });
      expect(pushLog?.metadata?.pushDryRun).toBeUndefined();
      expect(JSON.stringify(logs.page)).not.toContain("encrypted-value");
    });

    test("should reject an invalid push target", async () => {
      const { encryptedProjectKey } = await createProjectKey(owner.publicKey!);

      const projectResult = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project_" + randomString(),
      });
      const projectId = assertProjectCreated(projectResult);

      const { id: environmentId } = await owner.asUser.mutation(api.environment.createEnvironment, {
        name: "environment_" + randomString(),
        projectId,
      });

      await expectConvexError(
        () =>
          owner.asUser.mutation(api.secret.exportSecrets, {
            projectId,
            environmentId,
            push: { target: "Not A Target!" },
          }),
        ErrorCode.INVALID_ARGUMENTS,
      );

      await expectConvexError(
        () =>
          owner.asUser.mutation(api.secret.exportSecrets, {
            projectId,
            environmentId,
            push: { target: "vercel", destination: "x".repeat(201) },
          }),
        ErrorCode.INVALID_ARGUMENTS,
      );
    });

    test("should return the collaborator encrypted project key for shared project secret export", async () => {
      await setPlan(t, owner.userId, "pro");

      const { encryptedProjectKey } = await createProjectKey(owner.publicKey!);

      const projectResult = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project_" + randomString(),
      });
      const projectId = assertProjectCreated(projectResult);

      const { id: environmentId } = await owner.asUser.mutation(api.environment.createEnvironment, {
        name: "environment_" + randomString(),
        projectId,
      });

      const projectKey = await unwrapAESKeyWithRSA(encryptedProjectKey, owner.privateKey!);
      const encryptedValue = await encryptSecret(projectKey, "shared-secret-value");

      await owner.asUser.mutation(api.secret.createSecret, {
        encryptedValue,
        environmentId,
        key: "SHARED_KEY_" + randomString(),
        valueType: "string",
        folderId: undefined,
      });

      const collaboratorPublicKey = await importPublicKey(collaborator.publicKey!);
      const encryptedProjectKeyForCollaborator = await wrapAESKeyWithRSA(
        projectKey,
        collaboratorPublicKey,
      );

      await owner.asUser.action(api.projectShare.shareProject, {
        encryptedProjectKey: encryptedProjectKeyForCollaborator,
        projectId,
        userEmail: collaborator.email,
      });

      const ownerResult = await owner.asUser.mutation(api.secret.exportSecrets, {
        projectId,
        environmentId,
      });

      expect(ownerResult.count).toBe(1);
      expect(ownerResult.encryptedProjectKey).toBe(encryptedProjectKey);

      const collaboratorResult = await collaborator.asUser.mutation(api.secret.exportSecrets, {
        projectId,
        environmentId,
      });

      expect(collaboratorResult.count).toBe(1);
      expect(collaboratorResult.encryptedProjectKey).toBe(encryptedProjectKeyForCollaborator);
      expect(collaboratorResult.encryptedProjectKey).not.toBe(ownerResult.encryptedProjectKey);

      const collaboratorProjectKey = await unwrapAESKeyWithRSA(
        collaboratorResult.encryptedProjectKey,
        collaborator.privateKey!,
      );
      const decryptedValue = await decryptSecret(
        collaboratorProjectKey,
        collaboratorResult.secrets[0].encryptedValue,
      );
      expect(decryptedValue).toBe("shared-secret-value");
    });
  });

  describe("Integrity Checks", () => {
    let projectId: Id<"project">;
    let environmentId: Id<"environment">;

    beforeEach(async () => {
      await setPlan(t, owner.userId, "pro");
      const { encryptedProjectKey } = await createProjectKey(owner.publicKey!);
      projectId = assertProjectCreated(
        await owner.asUser.action(api.project.createProject, {
          encryptedProjectKey,
          name: "project_" + randomString(),
        }),
      );
      ({ id: environmentId } = await owner.asUser.mutation(api.environment.createEnvironment, {
        name: "environment_" + randomString(),
        projectId,
      }));
    });

    const create = (
      key: string,
      extra: { folderId?: Id<"folder">; expectedKeyVersion?: number } = {},
    ) =>
      owner.asUser.mutation(api.secret.createSecret, {
        environmentId,
        key,
        encryptedValue: "cipher-" + key,
        valueType: "string",
        ...extra,
      });

    test("should reject writes made with a stale project key version", async () => {
      const { id: secretId } = await create("FRESH", { expectedKeyVersion: 1 });
      const { id: legacyId } = await create("LEGACY");
      expect(legacyId).toBeDefined();

      await expectConvexError(
        () => create("STALE", { expectedKeyVersion: 0 }),
        ErrorCode.INVALID_RESOURCE_STATE,
        STALE_PROJECT_KEY_MESSAGE,
      );

      await expectConvexError(
        () =>
          owner.asUser.mutation(api.secret.updateSecret, {
            secretId,
            updates: { encryptedValue: "new", valueType: SecretValueType.String },
            expectedKeyVersion: 2,
          }),
        ErrorCode.INVALID_RESOURCE_STATE,
        STALE_PROJECT_KEY_MESSAGE,
      );

      await expectConvexError(
        () =>
          owner.asUser.mutation(api.secret.updateSecretBulk, {
            environmentId,
            secrets: [{ key: "BULK", encryptedValue: "x", valueType: "string" }],
            expectedKeyVersion: 2,
          }),
        ErrorCode.INVALID_RESOURCE_STATE,
        STALE_PROJECT_KEY_MESSAGE,
      );

      await owner.asUser.mutation(api.secret.updateSecret, {
        secretId,
        updates: { encryptedValue: "new", valueType: SecretValueType.String },
        expectedKeyVersion: 1,
      });
      const bulk = await owner.asUser.mutation(api.secret.updateSecretBulk, {
        environmentId,
        secrets: [{ key: "BULK", encryptedValue: "x", valueType: "string" }],
      });
      expect(bulk.createdCount).toBe(1);
    });

    test("should reject a folder from another environment", async () => {
      const { id: otherEnvironmentId } = await owner.asUser.mutation(
        api.environment.createEnvironment,
        { name: "other_" + randomString(), projectId },
      );
      const { id: foreignFolderId } = await owner.asUser.mutation(api.folder.createFolder, {
        environmentId: otherEnvironmentId,
        name: "foreign",
      });

      await expectConvexError(
        () => create("KEY", { folderId: foreignFolderId }),
        ErrorCode.INVALID_ARGUMENTS,
        "Folder does not belong to this environment",
      );

      await expectConvexError(
        () =>
          owner.asUser.mutation(api.secret.updateSecretBulk, {
            environmentId,
            folderId: foreignFolderId,
            secrets: [{ key: "KEY", encryptedValue: "x", valueType: "string" }],
          }),
        ErrorCode.INVALID_ARGUMENTS,
        "Folder does not belong to this environment",
      );
    });

    test("should enforce the per-environment secret limit on create", async () => {
      await t.run(async (ctx) => {
        const now = Date.now();
        for (let i = 0; i < 1024; i++) {
          await ctx.db.insert("secret", {
            projectId,
            environmentId,
            key: `SEED_${i}`,
            encryptedValue: "x",
            valueType: "string",
            scope: "shared",
            encryptionKeyVersion: 1,
            isDeleted: false,
            createdBy: owner.userId,
            createdAt: now,
            updatedBy: owner.userId,
            updatedAt: now,
          });
        }
      });

      await expectConvexError(() => create("ONE_TOO_MANY"), ErrorCode.ENVIRONMENT_LIMIT_REACHED);
    });

    test("should reject renaming a secret to an existing key", async () => {
      const { id: firstId } = await create("FIRST");
      const { id: secondId } = await create("SECOND");

      await expectConvexError(
        () =>
          owner.asUser.mutation(api.secret.updateSecret, {
            secretId: secondId,
            updates: { key: "FIRST", valueType: SecretValueType.String },
          }),
        ErrorCode.RESOURCE_ALREADY_EXISTS,
      );

      await expectConvexError(
        () =>
          owner.asUser.mutation(api.secret.updateSecretBulk, {
            environmentId,
            secrets: [
              { secretId: secondId, key: "FIRST", encryptedValue: "x", valueType: "string" },
            ],
            mode: "overwrite",
          }),
        ErrorCode.RESOURCE_ALREADY_EXISTS,
      );

      const skipped = await owner.asUser.mutation(api.secret.updateSecretBulk, {
        environmentId,
        secrets: [{ secretId: secondId, key: "FIRST", encryptedValue: "x", valueType: "string" }],
        mode: "skip",
      });
      expect(skipped.skippedCount).toBe(1);

      const first = await owner.asUser.query(api.secret.getSecret, { secretId: firstId });
      const second = await owner.asUser.query(api.secret.getSecret, { secretId: secondId });
      expect(first.key).toBe("FIRST");
      expect(second.key).toBe("SECOND");

      await owner.asUser.mutation(api.secret.updateSecret, {
        secretId: secondId,
        updates: { key: "RENAMED", valueType: SecretValueType.String },
      });
      expect((await owner.asUser.query(api.secret.getSecret, { secretId: secondId })).key).toBe(
        "RENAMED",
      );
    });

    test("should hide soft-deleted secrets and purge them with their folder", async () => {
      const { id: folderId } = await owner.asUser.mutation(api.folder.createFolder, {
        environmentId,
        name: "purge",
      });
      const { id: secretId } = await create("GONE", { folderId });

      await owner.asUser.mutation(api.secret.deleteSecret, { secretId });

      await expectConvexError(
        () => owner.asUser.query(api.secret.getSecret, { secretId }),
        ErrorCode.SECRET_NOT_FOUND,
      );

      await owner.asUser.mutation(api.folder.deleteFolder, { folderId });

      await t.run(async (ctx) => {
        expect(await ctx.db.get(secretId)).toBeNull();
        expect(await ctx.db.get(folderId)).toBeNull();
      });
    });

    test("should purge soft-deleted secrets when the environment is deleted", async () => {
      const { id: secretId } = await create("GONE");
      await owner.asUser.mutation(api.secret.deleteSecret, { secretId });

      await owner.asUser.mutation(api.environment.deleteEnvironment, { environmentId });

      await t.run(async (ctx) => {
        expect(await ctx.db.get(secretId)).toBeNull();
        expect(await ctx.db.get(environmentId)).toBeNull();
      });
    });
  });
});
