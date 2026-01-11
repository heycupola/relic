import {
  createProjectKey,
  decryptSecret,
  encryptSecret,
  importPublicKey,
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
  randomString,
  type TestUser,
} from "./setup";

describe("Project Sharing Performance", () => {
  let t: TestConvex<typeof schema>;
  let testUsers: TestUser[] = [];
  let owner: TestUser, collaborator: TestUser, collaborator2: TestUser;

  beforeEach(async () => {
    t = convexTest(schema, modules);

    const betterAuthSchema = await import("../convex/betterAuth/generatedSchema.ts");
    t.registerComponent("betterAuth", betterAuthSchema.default, betterAuthModules);

    testUsers = await getTestUsers(t);
    owner = testUsers[0]!;
    collaborator = testUsers[1]!;
    collaborator2 = testUsers[2]!;
  });

  afterEach(() => {
    mockAutumn.reset();
  });

  describe("Bulk Secret Rotation", () => {
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

    test("should rotate multiple secrets from multiple environments successfully", async () => {
      const secretKeys = Array.from({ length: 100 }, () => "key_" + randomString());
      const secretValues = Array.from({ length: 100 }, () => "value_" + randomString());
      const environmentNames = Array.from({ length: 32 }, () => "environment" + randomString());

      const { encryptedProjectKey, projectKey } = await createProjectKey(owner.publicKey!);

      const { projectId } = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project",
      });

      const secretIds: Id<"secret">[] = [];
      const environmentIds: Id<"environment">[] = [];
      for (const environmentName of environmentNames) {
        const { environmentId } = await owner.asUser.mutation(api.environment.createEnvironment, {
          name: environmentName,
          projectId,
        });
        environmentIds.push(environmentId);

        for (const [index, secretKey] of secretKeys.entries()) {
          const { secretId } = await owner.asUser.mutation(api.secret.createSecret, {
            encryptedValue: await encryptSecret(projectKey, secretValues[index]),
            environmentId,
            key: secretKey,
            valueType: "string",
            folderId: undefined,
          });
          secretIds.push(secretId);
        }
      }

      const importedCollaborator1PublicKey = await importPublicKey(collaborator.publicKey!);
      const encryptedProjectKeyForCollaborator1 = await wrapAESKeyWithRSA(
        projectKey,
        importedCollaborator1PublicKey,
      );

      const { shareId: shareWithCollaborator1Id } = await owner.asUser.action(
        api.projectShare.shareProject,
        {
          encryptedProjectKey: encryptedProjectKeyForCollaborator1,
          projectId,
          userEmail: collaborator.email,
        },
      );

      const importedCollaborator2PublicKey = await importPublicKey(collaborator2.publicKey!);
      const encryptedProjectKeyForCollaborator2 = await wrapAESKeyWithRSA(
        projectKey,
        importedCollaborator2PublicKey,
      );

      const { shareId: shareWithCollaborator2Id } = await owner.asUser.action(
        api.projectShare.shareProject,
        {
          encryptedProjectKey: encryptedProjectKeyForCollaborator2,
          projectId,
          userEmail: collaborator2.email,
        },
      );

      const { encryptedProjectKey: newEncryptedProjectKey, projectKey: newProjectKey } =
        await createProjectKey(owner.publicKey!);

      const newEncryptedProjectKeyForCollaborator2 = await wrapAESKeyWithRSA(
        newProjectKey,
        importedCollaborator2PublicKey,
      );

      const reEncryptedSecrets: { newEncryptedValue: string; secretId: Id<"secret"> }[] = [];
      let counter = 0;
      for (const _environmentId of environmentIds) {
        for (const [index, secretValue] of secretValues.entries()) {
          const encryptedSecret = await encryptSecret(newProjectKey, secretValue);

          reEncryptedSecrets.push({
            newEncryptedValue: encryptedSecret,
            secretId: secretIds[counter * 100 + index],
          });
        }

        counter += 1;
      }

      await owner.asUser.action(api.projectShare.revokeShareWithRotation, {
        newEncryptedProjectKey,
        shareId: shareWithCollaborator1Id,
        reEncryptedSecrets,
        rewrappedShares: [
          {
            newEncryptedProjectKey: newEncryptedProjectKeyForCollaborator2,
            shareId: shareWithCollaborator2Id,
          },
        ],
      });

      let verificationCounter = 0;
      for (const environmentId of environmentIds) {
        const secrets = await owner.asUser.query(internal.secret._loadSecretsByEnvironmentId, {
          environmentId,
        });

        expect(secrets.length).toBe(100);

        for (const [index, secret] of secrets.entries()) {
          const decryptedValue = await decryptSecret(newProjectKey, secret.encryptedValue);
          expect(decryptedValue).toBe(secretValues[index]);
          expect(secret._id).toBe(secretIds[verificationCounter * 100 + index]);
        }

        verificationCounter += 1;
      }

      const collaborator2Share = await collaborator2.asUser.query(
        api.projectShare.getProjectShareByProjectForCurrentUser,
        { projectId },
      );

      expect(collaborator2Share.encryptedProjectKey).toBe(newEncryptedProjectKeyForCollaborator2);

      for (const environmentId of environmentIds) {
        const secrets = await collaborator2.asUser.query(
          internal.secret._loadSecretsByEnvironmentId,
          {
            environmentId,
          },
        );

        expect(secrets.length).toBe(100);
      }

      await expectConvexError(
        () =>
          collaborator.asUser.query(api.projectShare.getProjectShareByProjectForCurrentUser, {
            projectId,
          }),
        ErrorCode.SHARE_NOT_FOUND,
      );
    }, 120_000);
  });
});
