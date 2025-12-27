import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { ErrorCode } from "../convex/lib/errors.ts";
import { SecretValueType } from "../convex/lib/types.ts";
import schema from "../convex/schema";
import {
  createProjectKey,
  decryptSecret,
  encryptSecret,
  importPublicKey,
  unwrapAESKeyWithRSA,
  wrapAESKeyWithRSA,
} from "./helpers/crypto";
import {
  betterAuthModules,
  expectConvexError,
  getTestUsers,
  mockAutumn,
  modules,
  randomString,
  type TestUser,
} from "./setup";

/**
 * TEST CASES
 * - Collaborators: Full CRUD on secrets, environments, folders
 * - Owner-only: Project update/archive/unarchive, share management
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

    mockAutumn.setFeature(owner.userId, "projects", 5);
    mockAutumn.setBooleanFeature(owner.userId, "can_share_project", true);
    mockAutumn.setFeature(owner.userId, "additional_shares", 5);
    mockAutumn.setFeature(collaborator.userId, "projects", 5);

    const { encryptedProjectKey } = await createProjectKey(owner.publicKey!);
    const result = await owner.asUser.action(api.project.createProject, {
      encryptedProjectKey,
      name: "shared-project-" + randomString(),
    });
    projectId = result.projectId;
    projectKey = await unwrapAESKeyWithRSA(encryptedProjectKey, owner.privateKey!);

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
    mockAutumn.reset();
  });

  describe("Secrets - Collaborator CRUD", () => {
    test("collaborator can CREATE secrets", async () => {
      const { environmentId } = await owner.asUser.mutation(api.environment.createEnvironment, {
        name: "env-" + randomString(),
        projectId,
      });

      const encryptedValue = await encryptSecret(projectKey, "secret-value");

      const { success, secretId } = await collaborator.asUser.mutation(api.secret.createSecret, {
        encryptedValue,
        encryptionKeyVersion: 1,
        environmentId,
        key: "API_KEY_" + randomString(),
        valueType: "string",
        folderId: undefined,
      });

      expect(success).toBe(true);
      expect(secretId).toBeDefined();
    });

    test("collaborator can READ secrets", async () => {
      const { environmentId } = await owner.asUser.mutation(api.environment.createEnvironment, {
        name: "env-" + randomString(),
        projectId,
      });

      const value = "my-secret-value";
      const encryptedValue = await encryptSecret(projectKey, value);

      const { secretId } = await owner.asUser.mutation(api.secret.createSecret, {
        encryptedValue,
        encryptionKeyVersion: 1,
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

    test("collaborator can UPDATE secrets", async () => {
      const { environmentId } = await owner.asUser.mutation(api.environment.createEnvironment, {
        name: "env-" + randomString(),
        projectId,
      });

      const { secretId } = await owner.asUser.mutation(api.secret.createSecret, {
        encryptedValue: await encryptSecret(projectKey, "old-value"),
        encryptionKeyVersion: 1,
        environmentId,
        key: "API_KEY_" + randomString(),
        valueType: "string",
        folderId: undefined,
      });

      const newValue = "new-secret-value";
      const newEncryptedValue = await encryptSecret(projectKey, newValue);

      const { success } = await collaborator.asUser.mutation(api.secret.updateSecret, {
        secretId,
        updates: {
          encryptedValue: newEncryptedValue,
          valueType: "string" as SecretValueType,
        },
      });

      expect(success).toBe(true);

      const updatedSecret = await owner.asUser.query(api.secret.getSecret, { secretId });
      const decryptedValue = await decryptSecret(projectKey, updatedSecret.encryptedValue);
      expect(decryptedValue).toBe(newValue);
    });

    test("collaborator can DELETE secrets", async () => {
      const { environmentId } = await owner.asUser.mutation(api.environment.createEnvironment, {
        name: "env-" + randomString(),
        projectId,
      });

      const { secretId } = await owner.asUser.mutation(api.secret.createSecret, {
        encryptedValue: await encryptSecret(projectKey, "value"),
        encryptionKeyVersion: 1,
        environmentId,
        key: "API_KEY_" + randomString(),
        valueType: "string",
        folderId: undefined,
      });

      const { success } = await collaborator.asUser.mutation(api.secret.deleteSecret, {
        secretId,
      });

      expect(success).toBe(true);
    });
  });

  describe("Environments - Collaborator CRUD", () => {
    test("collaborator can CREATE environments", async () => {
      const { success, environmentId } = await collaborator.asUser.mutation(
        api.environment.createEnvironment,
        {
          name: "collab-env-" + randomString(),
          projectId,
        },
      );

      expect(success).toBe(true);
      expect(environmentId).toBeDefined();
    });

    test("collaborator can READ environment data", async () => {
      const { environmentId } = await owner.asUser.mutation(api.environment.createEnvironment, {
        name: "env-" + randomString(),
        projectId,
      });

      const data = await collaborator.asUser.query(api.environment.getEnvironmentData, {
        environmentId,
      });

      expect(data.environment.id).toBe(environmentId);
    });

    test("collaborator can UPDATE environments", async () => {
      const { environmentId } = await owner.asUser.mutation(api.environment.createEnvironment, {
        name: "old-name",
        projectId,
      });

      const { success } = await collaborator.asUser.mutation(api.environment.updateEnvironment, {
        environmentId,
        name: "new-name",
      });

      expect(success).toBe(true);
    });

    test("collaborator can DELETE empty environments", async () => {
      const { environmentId } = await owner.asUser.mutation(api.environment.createEnvironment, {
        name: "temp-env-" + randomString(),
        projectId,
      });

      const { success } = await collaborator.asUser.mutation(api.environment.deleteEnvironment, {
        environmentId,
      });

      expect(success).toBe(true);
    });
  });

  describe("Folders - Collaborator CRUD", () => {
    let environmentId: Id<"environment">;

    beforeEach(async () => {
      const result = await owner.asUser.mutation(api.environment.createEnvironment, {
        name: "env-" + randomString(),
        projectId,
      });
      environmentId = result.environmentId;
    });

    test("collaborator can CREATE folders", async () => {
      const { success, folderId } = await collaborator.asUser.mutation(api.folder.createFolder, {
        environmentId,
        name: "collab-folder-" + randomString(),
      });

      expect(success).toBe(true);
      expect(folderId).toBeDefined();
    });

    test("collaborator can UPDATE folders", async () => {
      const { folderId } = await owner.asUser.mutation(api.folder.createFolder, {
        environmentId,
        name: "old-folder",
      });

      const { success } = await collaborator.asUser.mutation(api.folder.updateFolder, {
        folderId,
        name: "new-folder",
      });

      expect(success).toBe(true);
    });

    test("collaborator can DELETE empty folders", async () => {
      const { folderId } = await owner.asUser.mutation(api.folder.createFolder, {
        environmentId,
        name: "temp-folder-" + randomString(),
      });

      const { success } = await collaborator.asUser.mutation(api.folder.deleteFolder, {
        folderId,
      });

      expect(success).toBe(true);
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
      const { projectId: newProjectId } = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "archived-project-" + randomString(),
      });

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
      const { environmentId } = await owner.asUser.mutation(api.environment.createEnvironment, {
        name: "env-" + randomString(),
        projectId,
      });

      const { secretId } = await owner.asUser.mutation(api.secret.createSecret, {
        encryptedValue: await encryptSecret(projectKey, "value"),
        encryptionKeyVersion: 1,
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
      const { environmentId } = await owner.asUser.mutation(api.environment.createEnvironment, {
        name: "env-" + randomString(),
        projectId,
      });

      await expectConvexError(
        () =>
          nonCollaborator.asUser.mutation(api.secret.createSecret, {
            encryptedValue: "fake-encrypted",
            encryptionKeyVersion: 1,
            environmentId,
            key: "HACKED_KEY",
            valueType: "string",
            folderId: undefined,
          }),
        ErrorCode.INSUFFICIENT_PERMISSION,
      );
    });

    test("non-collaborator CANNOT read environment data", async () => {
      const { environmentId } = await owner.asUser.mutation(api.environment.createEnvironment, {
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
