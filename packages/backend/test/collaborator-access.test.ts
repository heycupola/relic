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

/**
 * TEST CASES
 * - Collaborators: Read-only access to secrets, environments, folders
 * - Owner-only: All writes, project update/archive/unarchive, share management
 */
describe("Collaborator Access Control", () => {
  let t: TestConvex<typeof schema>;
  let testUsers: TestUser[] = [];
  let owner: TestUser, collaborator: TestUser, nonCollaborator: TestUser;
  let projectId: Id<"project">;
  let projectKey: CryptoKey;

  beforeEach(async () => {
    t = convexTest(schema, modules);

    const betterAuthSchema = await import("../convex/betterAuth/generatedSchema.ts");
    t.registerComponent("betterAuth", betterAuthSchema.default, betterAuthModules);

    testUsers = await getTestUsers(t);
    owner = testUsers[0]!;
    collaborator = testUsers[1]!;
    nonCollaborator = testUsers[2]!;

    await setPlan(t, owner.userId, "pro");

    await setPlan(t, collaborator.userId, "pro");

    const { encryptedProjectKey } = await createProjectKey(owner.publicKey!);
    const result = await owner.asUser.action(api.project.createProject, {
      encryptedProjectKey,
      name: "shared-project-" + randomString(),
    });
    projectId = assertProjectCreated(result);
    projectKey = await unwrapAESKeyWithRSA(encryptedProjectKey, owner.privateKey!);

    // For sharing, we still use RSA (collaborator's master key is not available)
    // In production, collaborator would unwrap using their own master key
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
  });

  afterEach(() => {
    mockBilling.reset();
  });

  describe("Secrets - Collaborators are read-only", () => {
    test("collaborator CANNOT create secrets", async () => {
      const { id: environmentId } = await owner.asUser.mutation(api.environment.createEnvironment, {
        name: "env-" + randomString(),
        projectId,
      });

      const encryptedValue = await encryptSecret(projectKey, "secret-value");

      await expectConvexError(
        () =>
          collaborator.asUser.mutation(api.secret.createSecret, {
            encryptedValue,
            environmentId,
            key: "API_KEY_" + randomString(),
            valueType: "string",
            folderId: undefined,
          }),
        ErrorCode.INSUFFICIENT_PERMISSION,
      );
    });

    test("collaborator can READ secrets", async () => {
      const { id: environmentId } = await owner.asUser.mutation(api.environment.createEnvironment, {
        name: "env-" + randomString(),
        projectId,
      });

      const value = "my-secret-value";
      const encryptedValue = await encryptSecret(projectKey, value);

      const { id: secretId } = await owner.asUser.mutation(api.secret.createSecret, {
        encryptedValue,
        environmentId,
        key: "API_KEY_" + randomString(),
        valueType: "string",
        folderId: undefined,
      });

      const secret = await collaborator.asUser.query(api.secret.getSecret, { secretId });

      expect(secret.id).toBe(secretId);
      const decryptedValue = await decryptSecret(projectKey, secret.encryptedValue);
      expect(decryptedValue).toBe(value);
    });

    test("collaborator CANNOT update secrets", async () => {
      const { id: environmentId } = await owner.asUser.mutation(api.environment.createEnvironment, {
        name: "env-" + randomString(),
        projectId,
      });

      const { id: secretId } = await owner.asUser.mutation(api.secret.createSecret, {
        encryptedValue: await encryptSecret(projectKey, "old-value"),
        environmentId,
        key: "API_KEY_" + randomString(),
        valueType: "string",
        folderId: undefined,
      });

      const newEncryptedValue = await encryptSecret(projectKey, "new-secret-value");

      await expectConvexError(
        () =>
          collaborator.asUser.mutation(api.secret.updateSecret, {
            secretId,
            updates: {
              encryptedValue: newEncryptedValue,
              valueType: "string" as SecretValueType,
            },
          }),
        ErrorCode.INSUFFICIENT_PERMISSION,
      );

      const unchanged = await owner.asUser.query(api.secret.getSecret, { secretId });
      expect(await decryptSecret(projectKey, unchanged.encryptedValue)).toBe("old-value");
    });

    test("collaborator CANNOT bulk update secrets", async () => {
      const { id: environmentId } = await owner.asUser.mutation(api.environment.createEnvironment, {
        name: "env-" + randomString(),
        projectId,
      });

      await expectConvexError(
        async () =>
          collaborator.asUser.mutation(api.secret.updateSecretBulk, {
            environmentId,
            secrets: [
              {
                key: "API_KEY_" + randomString(),
                encryptedValue: await encryptSecret(projectKey, "value"),
                valueType: "string",
              },
            ],
          }),
        ErrorCode.INSUFFICIENT_PERMISSION,
      );
    });

    test("collaborator CANNOT delete secrets", async () => {
      const { id: environmentId } = await owner.asUser.mutation(api.environment.createEnvironment, {
        name: "env-" + randomString(),
        projectId,
      });

      const { id: secretId } = await owner.asUser.mutation(api.secret.createSecret, {
        encryptedValue: await encryptSecret(projectKey, "value"),
        environmentId,
        key: "API_KEY_" + randomString(),
        valueType: "string",
        folderId: undefined,
      });

      await expectConvexError(
        () => collaborator.asUser.mutation(api.secret.deleteSecret, { secretId }),
        ErrorCode.INSUFFICIENT_PERMISSION,
      );

      const stillThere = await owner.asUser.query(api.secret.getSecret, { secretId });
      expect(stillThere.id).toBe(secretId);
    });
  });

  describe("Environments - Collaborators are read-only", () => {
    test("collaborator CANNOT create environments", async () => {
      await expectConvexError(
        () =>
          collaborator.asUser.mutation(api.environment.createEnvironment, {
            name: "collab-env-" + randomString(),
            projectId,
          }),
        ErrorCode.INSUFFICIENT_PERMISSION,
      );
    });

    test("collaborator can READ environment data", async () => {
      const { id: environmentId } = await owner.asUser.mutation(api.environment.createEnvironment, {
        name: "env-" + randomString(),
        projectId,
      });

      const data = await collaborator.asUser.query(api.environment.getEnvironmentData, {
        environmentId,
      });

      expect(data.environment.id).toBe(environmentId);
    });

    test("collaborator CANNOT update environments", async () => {
      const { id: environmentId } = await owner.asUser.mutation(api.environment.createEnvironment, {
        name: "old-name",
        projectId,
      });

      await expectConvexError(
        () =>
          collaborator.asUser.mutation(api.environment.updateEnvironment, {
            environmentId,
            name: "new-name",
          }),
        ErrorCode.INSUFFICIENT_PERMISSION,
      );
    });

    test("collaborator CANNOT delete environments", async () => {
      const { id: environmentId } = await owner.asUser.mutation(api.environment.createEnvironment, {
        name: "temp-env-" + randomString(),
        projectId,
      });

      await expectConvexError(
        () => collaborator.asUser.mutation(api.environment.deleteEnvironment, { environmentId }),
        ErrorCode.INSUFFICIENT_PERMISSION,
      );
    });
  });

  describe("Folders - Collaborators are read-only", () => {
    let environmentId: Id<"environment">;

    beforeEach(async () => {
      const result = await owner.asUser.mutation(api.environment.createEnvironment, {
        name: "env-" + randomString(),
        projectId,
      });
      environmentId = result.id;
    });

    test("collaborator CANNOT create folders", async () => {
      await expectConvexError(
        () =>
          collaborator.asUser.mutation(api.folder.createFolder, {
            environmentId,
            name: "collab-folder-" + randomString(),
          }),
        ErrorCode.INSUFFICIENT_PERMISSION,
      );
    });

    test("collaborator CANNOT update folders", async () => {
      const { id: folderId } = await owner.asUser.mutation(api.folder.createFolder, {
        environmentId,
        name: "old-folder",
      });

      await expectConvexError(
        () =>
          collaborator.asUser.mutation(api.folder.updateFolder, {
            folderId,
            name: "new-folder",
          }),
        ErrorCode.INSUFFICIENT_PERMISSION,
      );
    });

    test("collaborator CANNOT delete folders", async () => {
      const { id: folderId } = await owner.asUser.mutation(api.folder.createFolder, {
        environmentId,
        name: "temp-folder-" + randomString(),
      });

      await expectConvexError(
        () => collaborator.asUser.mutation(api.folder.deleteFolder, { folderId }),
        ErrorCode.INSUFFICIENT_PERMISSION,
      );
    });
  });

  describe("Project - Owner Only Operations", () => {
    test("collaborator CANNOT update project name", async () => {
      await expectConvexError(
        () =>
          collaborator.asUser.mutation(api.project.updateProject, {
            projectId,
            name: "hacked-name",
          }),
        ErrorCode.INSUFFICIENT_PERMISSION,
      );
    });

    test("collaborator CANNOT archive project", async () => {
      await expectConvexError(
        () =>
          collaborator.asUser.action(api.project.archiveProject, {
            projectId,
          }),
        ErrorCode.INSUFFICIENT_PERMISSION,
      );
    });

    test("collaborator CANNOT unarchive project", async () => {
      // create a fresh project, share it, then archive it via owner
      const { encryptedProjectKey } = await createProjectKey(owner.publicKey!);
      const projectResult = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "archived-project-" + randomString(),
      });
      const newProjectId = assertProjectCreated(projectResult);

      // archive it (no shares = can archive)
      await owner.asUser.action(api.project.archiveProject, { projectId: newProjectId });

      await expectConvexError(
        () =>
          collaborator.asUser.action(api.project.unarchiveProject, {
            projectId: newProjectId,
          }),
        ErrorCode.INSUFFICIENT_PERMISSION,
      );
    });
  });

  describe("Non-Collaborator - No Access", () => {
    test("non-collaborator CANNOT read secrets", async () => {
      const { id: environmentId } = await owner.asUser.mutation(api.environment.createEnvironment, {
        name: "env-" + randomString(),
        projectId,
      });

      const { id: secretId } = await owner.asUser.mutation(api.secret.createSecret, {
        encryptedValue: await encryptSecret(projectKey, "value"),
        environmentId,
        key: "API_KEY",
        valueType: "string",
        folderId: undefined,
      });

      await expectConvexError(
        () => nonCollaborator.asUser.query(api.secret.getSecret, { secretId }),
        ErrorCode.INSUFFICIENT_PERMISSION,
      );
    });

    test("non-collaborator CANNOT create secrets", async () => {
      const { id: environmentId } = await owner.asUser.mutation(api.environment.createEnvironment, {
        name: "env-" + randomString(),
        projectId,
      });

      await expectConvexError(
        () =>
          nonCollaborator.asUser.mutation(api.secret.createSecret, {
            encryptedValue: "fake-encrypted",
            environmentId,
            key: "HACKED_KEY",
            valueType: "string",
            folderId: undefined,
          }),
        ErrorCode.INSUFFICIENT_PERMISSION,
      );
    });

    test("non-collaborator CANNOT read environment data", async () => {
      const { id: environmentId } = await owner.asUser.mutation(api.environment.createEnvironment, {
        name: "env-" + randomString(),
        projectId,
      });

      await expectConvexError(
        () => nonCollaborator.asUser.query(api.environment.getEnvironmentData, { environmentId }),
        ErrorCode.INSUFFICIENT_PERMISSION,
      );
    });
  });
});
