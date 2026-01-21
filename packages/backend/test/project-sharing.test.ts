import {
  createProjectKey,
  decryptSecret,
  encryptSecret,
  importPublicKey,
  unwrapAESKeyWithRSA,
  wrapAESKeyWithRSA,
} from "@repo/crypto";
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { ErrorCode } from "../convex/lib/errors.ts";
import * as projectShareModule from "../convex/projectShare";
import schema from "../convex/schema";
import {
  betterAuthModules,
  expectConvexError,
  getTestUsers,
  mockAutumn,
  modules,
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

  describe("Share Management", () => {
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

      const projectResult = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project-name",
      });

      const projectId = assertProjectCreated(projectResult);

      const projectKey = await unwrapAESKeyWithRSA(encryptedProjectKey, owner.privateKey!);

      const collaboratorPublicKey = await importPublicKey(collaborator.publicKey!);

      const encryptedProjectKeyForCollaborator = await wrapAESKeyWithRSA(
        projectKey,
        collaboratorPublicKey,
      );

      const shareResult = await owner.asUser.action(api.projectShare.shareProject, {
        encryptedProjectKey: encryptedProjectKeyForCollaborator,
        projectId,
        userEmail: collaborator.email,
      });

      expect(shareResult.success).toBe(false);
      expect(shareResult.requiresProPlan).toBe(true);
    });

    test("fails when user has no enough shares left", async () => {
      mockAutumn.setFeature(owner.userId, "additional_shares", 0);

      const { encryptedProjectKey } = await createProjectKey(owner.publicKey!);

      const projectResult = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project-name",
      });

      const projectId = assertProjectCreated(projectResult);

      const projectKey = await unwrapAESKeyWithRSA(encryptedProjectKey, owner.privateKey!);

      const collaboratorPublicKey = await importPublicKey(collaborator.publicKey!);

      const encryptedProjectKeyForCollaborator = await wrapAESKeyWithRSA(
        projectKey,
        collaboratorPublicKey,
      );

      const shareResult1 = await owner.asUser.action(api.projectShare.shareProject, {
        encryptedProjectKey: encryptedProjectKeyForCollaborator,
        projectId,
        userEmail: collaborator.email,
        confirmPayment: true,
      });

      if (!shareResult1.success) {
        throw new Error(`Share 1 failed: ${shareResult1.message || "Unknown error"}`);
      }

      const collaborator2PublicKey = await importPublicKey(collaborator2.publicKey!);

      const encryptedProjectKeyForCollaborator2 = await wrapAESKeyWithRSA(
        projectKey,
        collaborator2PublicKey,
      );

      const shareResult2 = await owner.asUser.action(api.projectShare.shareProject, {
        encryptedProjectKey: encryptedProjectKeyForCollaborator2,
        projectId,
        userEmail: collaborator2.email,
        confirmPayment: true,
      });

      expect(shareResult2.success).toBe(false);
      expect(
        shareResult2.requiresConfirmation ||
          shareResult2.paymentFailed ||
          shareResult2.requiresRemoval,
      ).toBe(true);
    });

    test("should share a project to a collaborator", async () => {
      const { encryptedProjectKey } = await createProjectKey(owner.publicKey!);

      const projectResult = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project-name",
        confirmPayment: true,
      });
      const projectId = assertProjectCreated(projectResult);

      const projectKey = await unwrapAESKeyWithRSA(encryptedProjectKey, owner.privateKey!);

      const collaboratorPublicKey = await importPublicKey(collaborator.publicKey!);

      const encryptedProjectKeyForCollaborator = await wrapAESKeyWithRSA(
        projectKey,
        collaboratorPublicKey,
      );

      const shareResult = await owner.asUser.action(api.projectShare.shareProject, {
        encryptedProjectKey: encryptedProjectKeyForCollaborator,
        projectId,
        userEmail: collaborator.email,
        confirmPayment: true,
      });

      if (!shareResult.success) {
        throw new Error(`Share failed: ${shareResult.message || "Unknown error"}`);
      }

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

      const projectResult = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project-name",
        confirmPayment: true,
      });

      const projectId = assertProjectCreated(projectResult);

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

      const shareResult1 = await owner.asUser.action(api.projectShare.shareProject, {
        encryptedProjectKey: encryptedProjectKeyForCollaborator1,
        projectId,
        userEmail: collaborator.email,
        confirmPayment: true,
      });

      if (!shareResult1.success) {
        throw new Error(`Share 1 failed: ${shareResult1.message || "Unknown error"}`);
      }

      const shareResult2 = await owner.asUser.action(api.projectShare.shareProject, {
        encryptedProjectKey: encryptedProjectKeyForCollaborator2,
        projectId,
        userEmail: collaborator2.email,
        confirmPayment: true,
      });

      if (!shareResult2.success) {
        throw new Error(`Share 2 failed: ${shareResult2.message || "Unknown error"}`);
      }

      const { id: environmentId } = await owner.asUser.mutation(api.environment.createEnvironment, {
        name: "test",
        projectId,
      });

      const key = "API_KEY";
      const value = "rk_9c2f1a7e4d8b5a0f3e6c9d2b7a1e4f8c";
      const encryptedValue = await encryptSecret(projectKey, value);

      const { id: secretId } = await owner.asUser.mutation(api.secret.createSecret, {
        key,
        encryptedValue,
        valueType: "string",
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

      if (!projectShare1 || !projectShare2) {
        throw new Error("Project shares not found after creation");
      }

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
      const projectResult = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project-name",
        confirmPayment: true,
      });

      const projectId = assertProjectCreated(projectResult);

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
      const projectResult = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project-name",
        confirmPayment: true,
      });

      const projectId = assertProjectCreated(projectResult);

      const shareResult1 = await owner.asUser.action(api.projectShare.shareProject, {
        encryptedProjectKey,
        projectId,
        userEmail: collaborator.email,
        confirmPayment: true,
      });

      if (!shareResult1.success) {
        throw new Error(`Share 1 failed: ${shareResult1.message || "Unknown error"}`);
      }

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
      const projectResult = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project-name",
      });
      const projectId = assertProjectCreated(projectResult);

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
      const projectResult = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project-name",
        confirmPayment: true,
      });

      const projectId = assertProjectCreated(projectResult);

      const projectKey = await unwrapAESKeyWithRSA(encryptedProjectKey, owner.privateKey!);
      const collaboratorPublicKey = await importPublicKey(collaborator.publicKey!);
      const encryptedProjectKeyForCollaborator = await wrapAESKeyWithRSA(
        projectKey,
        collaboratorPublicKey,
      );

      const shareResult = await owner.asUser.action(api.projectShare.shareProject, {
        encryptedProjectKey: encryptedProjectKeyForCollaborator,
        projectId,
        userEmail: collaborator.email,
        confirmPayment: true,
      });

      if (!shareResult.success) {
        throw new Error(`Share failed: ${shareResult.message || "Unknown error"}`);
      }

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
      const projectResult = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project-name",
        confirmPayment: true,
      });

      const projectId = assertProjectCreated(projectResult);

      const projectKey = await unwrapAESKeyWithRSA(encryptedProjectKey, owner.privateKey!);
      const collaboratorPublicKey = await importPublicKey(collaborator.publicKey!);
      const encryptedProjectKeyForCollaborator = await wrapAESKeyWithRSA(
        projectKey,
        collaboratorPublicKey,
      );

      const shareResult = await owner.asUser.action(api.projectShare.shareProject, {
        encryptedProjectKey: encryptedProjectKeyForCollaborator,
        projectId,
        userEmail: collaborator.email,
        confirmPayment: true,
      });

      if (!shareResult.success) {
        throw new Error(`Share failed: ${shareResult.message || "Unknown error"}`);
      }

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
      const projectResult = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project",
        confirmPayment: true,
      });

      const projectId = assertProjectCreated(projectResult);

      const { id: environmentId } = await owner.asUser.mutation(api.environment.createEnvironment, {
        name: "env",
        projectId,
      });

      const { id: secretId } = await owner.asUser.mutation(api.secret.createSecret, {
        encryptedValue: await encryptSecret(projectKey, "value1"),
        environmentId,
        key: "key1",
        valueType: "string",
      });

      await owner.asUser.mutation(api.secret.deleteSecret, {
        secretId,
      });

      const shareResult = await owner.asUser.action(api.projectShare.shareProject, {
        encryptedProjectKey: await wrapAESKeyWithRSA(
          projectKey,
          await importPublicKey(collaborator.publicKey!),
        ),
        projectId,
        userEmail: collaborator.email,
        confirmPayment: true,
      });

      if (!shareResult.success || !shareResult.shareId) {
        throw new Error(`Share failed: ${shareResult.message || "Unknown error"}`);
      }

      const shareId = shareResult.shareId;

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

  describe("Subscription Cancellation", () => {
    let freeShareLimitSpy: ReturnType<typeof vi.spyOn>;
    let additionalUsers: TestUser[];

    beforeEach(async () => {
      freeShareLimitSpy = vi
        .spyOn(projectShareModule.shareLimits, "freeShareLimit", "get")
        .mockReturnValue(5);

      mockAutumn.setFeature(owner.userId, "projects", 2);
      mockAutumn.setBooleanFeature(owner.userId, "can_share_project", true);
      mockAutumn.setFeature(owner.userId, "additional_shares", 8);

      mockAutumn.setFeature(collaborator.userId, "projects", 2);
      mockAutumn.setFeature(collaborator2.userId, "projects", 2);

      additionalUsers = testUsers.slice(5);
      for (const user of additionalUsers) {
        mockAutumn.setFeature(user.userId, "projects", 2);
      }
    });

    afterEach(() => {
      freeShareLimitSpy?.mockRestore();
    });

    test("should block new share when subscription cancelled and over limit", async () => {
      const { encryptedProjectKey } = await createProjectKey(owner.publicKey!);

      const projectResult = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project-name",
        confirmPayment: true,
      });
      const projectId = assertProjectCreated(projectResult);

      const projectKey = await unwrapAESKeyWithRSA(encryptedProjectKey, owner.privateKey!);

      const usersToShare = [
        collaborator,
        collaborator2,
        collaborator3,
        ...additionalUsers.slice(0, 5),
      ];

      for (let i = 0; i < 8; i++) {
        const targetUser = usersToShare[i]!;
        const targetPublicKey = await importPublicKey(targetUser.publicKey!);
        const encryptedKey = await wrapAESKeyWithRSA(projectKey, targetPublicKey);

        const shareResult = await owner.asUser.action(api.projectShare.shareProject, {
          encryptedProjectKey: encryptedKey,
          projectId,
          userEmail: targetUser.email,
          confirmPayment: true,
        });

        if (!shareResult.success) {
          throw new Error(`Share ${i} failed: ${shareResult.message || "Unknown error"}`);
        }
      }

      mockAutumn.setFeature(owner.userId, "additional_shares", 6, 8);

      const newUserPublicKey = await importPublicKey(nonCollaborator.publicKey!);
      const encryptedProjectKeyForNewUser = await wrapAESKeyWithRSA(projectKey, newUserPublicKey);

      const newShareResult = await owner.asUser.action(api.projectShare.shareProject, {
        encryptedProjectKey: encryptedProjectKeyForNewUser,
        projectId,
        userEmail: nonCollaborator.email,
        confirmPayment: true,
      });

      expect(newShareResult.success).toBe(false);
      expect(newShareResult.requiresRemoval).toBe(true);
      expect(newShareResult.currentUsage).toBe(8);
      expect(newShareResult.includedUsage).toBe(6);
      expect(newShareResult.excessCount).toBe(2);
    });

    test("should allow new share after reducing usage below limit", async () => {
      mockAutumn.setFeature(owner.userId, "additional_shares", 6, 8);

      const { encryptedProjectKey } = await createProjectKey(owner.publicKey!);

      const projectResult = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project-name",
        confirmPayment: true,
      });
      const projectId = assertProjectCreated(projectResult);

      mockAutumn.setFeature(owner.userId, "additional_shares", 6, 6);

      const projectKey = await unwrapAESKeyWithRSA(encryptedProjectKey, owner.privateKey!);
      const newUserPublicKey = await importPublicKey(nonCollaborator.publicKey!);
      const encryptedProjectKeyForNewUser = await wrapAESKeyWithRSA(projectKey, newUserPublicKey);

      const newShareResult = await owner.asUser.action(api.projectShare.shareProject, {
        encryptedProjectKey: encryptedProjectKeyForNewUser,
        projectId,
        userEmail: nonCollaborator.email,
        confirmPayment: true,
      });

      expect(newShareResult.success).toBe(true);
    });
  });
});
