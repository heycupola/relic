import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { ErrorCode } from "../convex/lib/errors.ts";
import * as projectShareModule from "../convex/projectShare";
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

describe("Project Sharing", () => {
  let t: TestConvex<typeof schema>;
  let testUsers: TestUser[] = [];
  let owner: TestUser,
    collaborator: TestUser,
    collaborator2: TestUser,
    collaborator3: TestUser,
    nonCollaborator: TestUser;

  beforeEach(async () => {
    t = convexTest(schema, modules);

    const betterAuthSchema = await import("../convex/betterAuth/generatedSchema.ts");
    t.registerComponent("betterAuth", betterAuthSchema.default, betterAuthModules);

    testUsers = await getTestUsers(t);
    owner = testUsers[0]!;
    collaborator = testUsers[1]!;
    collaborator2 = testUsers[2]!;
    collaborator3 = testUsers[3]!;
    nonCollaborator = testUsers[4];
  });

  afterEach(() => {
    mockAutumn.reset();
  });

  describe("Project Sharing", () => {
    let freeShareLimitSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(async () => {
      freeShareLimitSpy = vi
        .spyOn(projectShareModule.shareLimits, "freeShareLimit", "get")
        .mockReturnValue(1);

      mockAutumn.setFeature(owner.userId, "projects", 2);
      mockAutumn.setBooleanFeature(owner.userId, "can_share_project", true);
      mockAutumn.setFeature(owner.userId, "additional_shares", 2);

      mockAutumn.setFeature(collaborator.userId, "projects", 2);
    });

    afterEach(() => {
      freeShareLimitSpy?.mockRestore();
    });

    test("fails when user has no pro plan", async () => {
      mockAutumn.setBooleanFeature(owner.userId, "can_share_project", false);

      const { encryptedProjectKey } = await createProjectKey(owner.publicKey!);

      const { projectId } = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project-name",
      });

      const projectKey = await unwrapAESKeyWithRSA(encryptedProjectKey, owner.privateKey!);

      const collaboratorPublicKey = await importPublicKey(collaborator.publicKey!);

      const encryptedProjectKeyForCollaborator = await wrapAESKeyWithRSA(
        projectKey,
        collaboratorPublicKey,
      );

      await expectConvexError(
        () =>
          owner.asUser.action(api.projectShare.shareProject, {
            encryptedProjectKey: encryptedProjectKeyForCollaborator,
            projectId,
            userEmail: collaborator.email,
          }),
        ErrorCode.PRO_PLAN_REQUIRED,
        "get pro plan",
      );
    });

    test("fails when user has no enough shares left", async () => {
      mockAutumn.setFeature(owner.userId, "additional_shares", 0);

      const { encryptedProjectKey } = await createProjectKey(owner.publicKey!);

      const { projectId } = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project-name",
      });

      const projectKey = await unwrapAESKeyWithRSA(encryptedProjectKey, owner.privateKey!);

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

      const collaborator2PublicKey = await importPublicKey(collaborator2.publicKey!);

      const encryptedProjectKeyForCollaborator2 = await wrapAESKeyWithRSA(
        projectKey,
        collaborator2PublicKey,
      );

      await expectConvexError(
        () =>
          owner.asUser.action(api.projectShare.shareProject, {
            encryptedProjectKey: encryptedProjectKeyForCollaborator2,
            projectId,
            userEmail: collaborator2.email,
          }),
        ErrorCode.PROJECT_SHARES_LIMIT_REACHED,
      );
    });

    test("should share a project to a collaborator", async () => {
      const { encryptedProjectKey } = await createProjectKey(owner.publicKey!);

      const { projectId } = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project-name",
      });

      const projectKey = await unwrapAESKeyWithRSA(encryptedProjectKey, owner.privateKey!);

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

      const projectShare = await collaborator.asUser.query(
        api.projectShare.getProjectShareByProjectForCurrentUser,
        {
          projectId,
        },
      );

      expect(projectShare.projectId).toBe(projectId);
      expect(projectShare.encryptedProjectKey).toBe(encryptedProjectKeyForCollaborator);

      const { shares: sharesByProject } = await owner.asUser.query(
        api.projectShare.listActiveProjectSharesByProject,
        {
          projectId,
        },
      );

      expect(sharesByProject.length).toBe(1);
      expect(sharesByProject[0].projectId).toBe(projectId);
      expect(sharesByProject[0].userId).toBe(collaborator.userId);

      const { shares: sharesByCurrentUser } = await collaborator.asUser.query(
        api.projectShare.listActiveSharedProjectsForCurrentUser,
        {},
      );

      expect(sharesByCurrentUser.length).toBe(1);
      expect(sharesByCurrentUser[0].projectId).toBe(projectId);
    });

    test("should revoke a share, rotate project keys and secret encryptions", async () => {
      const { encryptedProjectKey } = await createProjectKey(owner.publicKey!);

      const { projectId } = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project-name",
      });

      const projectKey = await unwrapAESKeyWithRSA(encryptedProjectKey, owner.privateKey!);

      const [collaboratorPublicKey1, collaboratorPublicKey2] = await Promise.all([
        await importPublicKey(collaborator.publicKey!),
        await importPublicKey(collaborator2.publicKey!),
      ]);

      const [encryptedProjectKeyForCollaborator1, encryptedProjectKeyForCollaborator2] =
        await Promise.all([
          wrapAESKeyWithRSA(projectKey, collaboratorPublicKey1),
          wrapAESKeyWithRSA(projectKey, collaboratorPublicKey2),
        ]);

      await owner.asUser.action(api.projectShare.shareProject, {
        encryptedProjectKey: encryptedProjectKeyForCollaborator1,
        projectId,
        userEmail: collaborator.email,
      });

      await owner.asUser.action(api.projectShare.shareProject, {
        encryptedProjectKey: encryptedProjectKeyForCollaborator2,
        projectId,
        userEmail: collaborator2.email,
      });

      const { environmentId } = await owner.asUser.mutation(api.environment.createEnvironment, {
        name: "test",
        projectId,
      });

      const key = "API_KEY";
      const value = "rk_9c2f1a7e4d8b5a0f3e6c9d2b7a1e4f8c";
      const encryptedValue = await encryptSecret(projectKey, value);

      const { secretId } = await owner.asUser.mutation(api.secret.createSecret, {
        key,
        encryptionKeyVersion: 1,
        encryptedValue,
        primitiveType: "string",
        environmentId,
        folderId: undefined,
      });

      const projectShare1 = await collaborator.asUser.query(
        api.projectShare.getProjectShareByProjectForCurrentUser,
        {
          projectId,
        },
      );

      const projectShare2 = await collaborator2.asUser.query(
        api.projectShare.getProjectShareByProjectForCurrentUser,
        {
          projectId,
        },
      );

      // NOTE: testing encryption
      const projectKeyFromC1 = await unwrapAESKeyWithRSA(
        projectShare1.encryptedProjectKey,
        collaborator.privateKey!,
      );

      // Compare the exported raw key bytes since CryptoKey objects can't be compared directly
      const exportedOriginal = await crypto.subtle.exportKey("raw", projectKey);
      const exportedDecrypted = await crypto.subtle.exportKey("raw", projectKeyFromC1);

      expect(new Uint8Array(exportedDecrypted)).toEqual(new Uint8Array(exportedOriginal));
      // end of testing encryption

      // NOTE: test revokeShare with key rotations

      const { encryptedProjectKey: newEncryptedProjectKey, projectKey: newProjectKey } =
        await createProjectKey(owner.publicKey!);

      const exportedProjectKey = await crypto.subtle.exportKey("raw", projectKey);
      const exportedNewProjectKey = await crypto.subtle.exportKey("raw", newProjectKey);
      expect(new Uint8Array(exportedProjectKey)).not.toBe(new Uint8Array(exportedNewProjectKey));

      const newEncryptedValue = await encryptSecret(newProjectKey, value);
      const newEncryptedProjectKeyForCollaborator2 = await wrapAESKeyWithRSA(
        newProjectKey,
        collaboratorPublicKey2,
      );

      await owner.asUser.action(api.projectShare.revokeShareWithRotation, {
        shareId: projectShare1.id,
        newEncryptedProjectKey,
        rewrappedShares: [
          {
            shareId: projectShare2.id,
            newEncryptedProjectKey: newEncryptedProjectKeyForCollaborator2,
          },
        ],
        reEncryptedSecrets: [
          {
            newEncryptedValue,
            secretId,
          },
        ],
      });

      await expectConvexError(
        () =>
          collaborator.asUser.query(api.projectShare.getProjectShareByProjectForCurrentUser, {
            projectId,
          }),
        ErrorCode.SHARE_NOT_FOUND,
      );

      const updatedProjectShare2 = await collaborator2.asUser.query(
        api.projectShare.getProjectShareByProjectForCurrentUser,
        {
          projectId,
        },
      );

      const rewrappedProjectKeyFromCollaborator2 = await unwrapAESKeyWithRSA(
        updatedProjectShare2.encryptedProjectKey,
        collaborator2.privateKey!,
      );
      const exportedRewrappedProjectKeyFromCollaborator2 = await crypto.subtle.exportKey(
        "raw",
        rewrappedProjectKeyFromCollaborator2,
      );

      expect(new Uint8Array(exportedRewrappedProjectKeyFromCollaborator2)).toEqual(
        new Uint8Array(exportedNewProjectKey),
      );

      const updatedSecret = await owner.asUser.query(api.secret.getSecret, {
        secretId,
      });

      expect(updatedSecret.encryptionKeyVersion).toBe(2);

      const decryptedSecret = await decryptSecret(
        rewrappedProjectKeyFromCollaborator2,
        updatedSecret.encryptedValue,
      );
      expect(decryptedSecret).toBe(value);

      await owner.asUser.action(api.projectShare.revokeShare, { shareId: projectShare2.id });

      await expectConvexError(
        () =>
          collaborator2.asUser.query(api.projectShare.getProjectShareByProjectForCurrentUser, {
            projectId,
          }),
        ErrorCode.SHARE_NOT_FOUND,
      );
    });

    test("fails when sharing to non-existent user", async () => {
      const { encryptedProjectKey } = await createProjectKey(owner.publicKey!);
      const { projectId } = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project-name",
      });

      await expectConvexError(
        () =>
          owner.asUser.action(api.projectShare.shareProject, {
            encryptedProjectKey,
            projectId,
            userEmail: "nonexistent@example.com",
          }),
        ErrorCode.USER_NOT_FOUND,
      );
    });

    test("fails when sharing twice to same user", async () => {
      const { encryptedProjectKey } = await createProjectKey(owner.publicKey!);
      const { projectId } = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project-name",
      });

      await owner.asUser.action(api.projectShare.shareProject, {
        encryptedProjectKey,
        projectId,
        userEmail: collaborator.email,
      });

      await expectConvexError(
        () =>
          owner.asUser.action(api.projectShare.shareProject, {
            encryptedProjectKey,
            projectId,
            userEmail: collaborator.email,
          }),
        ErrorCode.RESOURCE_ALREADY_EXISTS,
        "share",
      );
    });

    test("fails when non-owner tries to share", async () => {
      const { encryptedProjectKey } = await createProjectKey(owner.publicKey!);
      const { projectId } = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project-name",
      });

      await expectConvexError(
        () =>
          collaborator.asUser.action(api.projectShare.shareProject, {
            encryptedProjectKey,
            projectId,
            userEmail: collaborator2.email,
          }),
        ErrorCode.INSUFFICIENT_PERMISSION,
      );
    });

    test("fails when non-owner tries to revoke", async () => {
      const { encryptedProjectKey } = await createProjectKey(owner.publicKey!);
      const { projectId } = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project-name",
      });

      const projectKey = await unwrapAESKeyWithRSA(encryptedProjectKey, owner.privateKey!);
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

      const projectShare = await collaborator.asUser.query(
        api.projectShare.getProjectShareByProjectForCurrentUser,
        { projectId },
      );

      await expectConvexError(
        () =>
          collaborator.asUser.action(api.projectShare.revokeShare, { shareId: projectShare.id }),
        ErrorCode.INSUFFICIENT_PERMISSION,
      );
    });

    test("fails when revoking already revoked share", async () => {
      const { encryptedProjectKey } = await createProjectKey(owner.publicKey!);
      const { projectId } = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project-name",
      });

      const projectKey = await unwrapAESKeyWithRSA(encryptedProjectKey, owner.privateKey!);
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

      const projectShare = await collaborator.asUser.query(
        api.projectShare.getProjectShareByProjectForCurrentUser,
        { projectId },
      );

      await owner.asUser.action(api.projectShare.revokeShare, { shareId: projectShare.id });

      await expectConvexError(
        () => owner.asUser.action(api.projectShare.revokeShare, { shareId: projectShare.id }),
        ErrorCode.INVALID_OPERATION,
      );
    });

    test("should rollback when invalid secret ID provided", async () => {
      const { encryptedProjectKey, projectKey } = await createProjectKey(owner.publicKey!);
      const { projectId } = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project",
      });

      const { environmentId } = await owner.asUser.mutation(api.environment.createEnvironment, {
        name: "env",
        projectId,
      });

      const { secretId } = await owner.asUser.mutation(api.secret.createSecret, {
        encryptionKeyVersion: 1,
        encryptedValue: await encryptSecret(projectKey, "value1"),
        environmentId,
        key: "key1",
        primitiveType: "string",
      });

      await owner.asUser.mutation(api.secret.deleteSecret, {
        secretId,
      });

      const { shareId } = await owner.asUser.action(api.projectShare.shareProject, {
        encryptedProjectKey: await wrapAESKeyWithRSA(
          projectKey,
          await importPublicKey(collaborator.publicKey!),
        ),
        projectId,
        userEmail: collaborator.email,
      });

      const { encryptedProjectKey: newEncryptedProjectKey, projectKey: newProjectKey } =
        await createProjectKey(owner.publicKey!);

      const newEncryptedValue = await encryptSecret(newProjectKey, "value1");

      await expectConvexError(
        () =>
          owner.asUser.action(api.projectShare.revokeShareWithRotation, {
            newEncryptedProjectKey,
            shareId,
            reEncryptedSecrets: [
              {
                secretId,
                newEncryptedValue,
              },
            ],
            rewrappedShares: [],
          }),
        ErrorCode.SECRET_NOT_FOUND,
      );

      const project = await owner.asUser.query(internal.project._loadProjectById, { projectId });
      expect(project.encryptedProjectKey).toBe(encryptedProjectKey);
      expect(project.keyVersion).toBe(1);

      const secret = await owner.asUser.query(internal.secret._loadSecretById, { secretId });
      const decryptedValue = await decryptSecret(projectKey, secret!.encryptedValue);
      expect(decryptedValue).toBe("value1");

      const share = await collaborator.asUser.query(
        api.projectShare.getProjectShareByProjectForCurrentUser,
        { projectId },
      );
      expect(share).toBeDefined();
    });
  });
});
