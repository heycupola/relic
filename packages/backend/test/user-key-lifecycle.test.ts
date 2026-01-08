import {
  createProjectKey,
  createUserKeys,
  decryptPrivateKeyWithPassword,
  encryptPrivateKeyWithPassword,
  exportPrivateKey,
  importPublicKey,
  wrapAESKeyWithRSA,
} from "@repo/crypto";
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
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

describe("User Key Lifecycle", () => {
  let t: TestConvex<typeof schema>;
  let testUsers: TestUser[] = [];
  let owner: TestUser, owner2: TestUser, collaborator: TestUser, collaborator2: TestUser;

  beforeEach(async () => {
    t = convexTest(schema, modules);

    const betterAuthSchema = await import("../convex/betterAuth/generatedSchema.ts");
    t.registerComponent("betterAuth", betterAuthSchema.default, betterAuthModules);

    testUsers = await getTestUsers(t);
    owner = testUsers[0]!;
    owner2 = testUsers[1]!;
    collaborator = testUsers[2];
    collaborator2 = testUsers[3];
  });

  afterEach(() => {
    mockAutumn.reset();
  });

  describe("Key Rotation", () => {
    describe("With Shared Projects", () => {
      let freeShareLimitSpy: ReturnType<typeof vi.spyOn>;

      beforeEach(async () => {
        freeShareLimitSpy = vi
          .spyOn(projectShareModule.shareLimits, "freeShareLimit", "get")
          .mockReturnValue(1);

        mockAutumn.setFeature(owner.userId, "projects", 2);
        mockAutumn.setFeature(owner.userId, "additional_shares", 2);
        mockAutumn.setBooleanFeature(owner.userId, "can_share_project", true);
        mockAutumn.setFeature(owner2.userId, "projects", 10);
        mockAutumn.setFeature(owner2.userId, "additional_shares", 2);
        mockAutumn.setBooleanFeature(owner2.userId, "can_share_project", true);
        mockAutumn.setFeature(collaborator.userId, "projects", 2);
      });

      test("should rotate user keys successfully", async () => {
        const newPassword = "new-password" + randomString();

        const a = await createUserKeys(newPassword);
        const b = await createUserKeys(newPassword);

        expect(a.publicKey).not.toBe(b.publicKey);
        expect(a.encryptedPrivateKey).not.toBe(b.encryptedPrivateKey);
        expect(a.salt).not.toBe(b.salt);

        await owner.asUser.mutation(api.userKey.rotateUserKeys, {
          newEncryptedPrivateKey: a.encryptedPrivateKey,
          newPublicKey: a.publicKey,
          newSalt: a.salt,
          rewrappedOwnedProjects: [],
          rewrappedShares: [],
        });

        const user = await owner.asUser.query(api.user.getCurrentUser, {});

        expect(user.publicKey).toBe(a.publicKey);
        expect(user.encryptedPrivateKey).toBe(a.encryptedPrivateKey);
        expect(user.salt).toBe(a.salt);
      });

      test("should rotate user keys and rewrap owned projects and shared projects", async () => {
        // creating a couple of projects + a couple of project shares
        const { encryptedProjectKey: ePK1, projectKey: pK1 } = await createProjectKey(
          owner.publicKey!,
        );
        const { encryptedProjectKey: ePK2, projectKey: pK2 } = await createProjectKey(
          owner.publicKey!,
        );
        const { encryptedProjectKey: ePK3, projectKey: pK3 } = await createProjectKey(
          owner.publicKey!,
        );
        const { encryptedProjectKey: ePK4, projectKey: pK4 } = await createProjectKey(
          owner.publicKey!,
        );
        const { encryptedProjectKey: ePK5, projectKey: pK5 } = await createProjectKey(
          owner.publicKey!,
        );

        const { projectId: p1Id } = await owner2.asUser.action(api.project.createProject, {
          name: "project-name-1",
          encryptedProjectKey: ePK1,
        });
        const { projectId: p2Id } = await owner2.asUser.action(api.project.createProject, {
          name: "project-name-2",
          encryptedProjectKey: ePK2,
        });
        const { projectId: p3Id } = await owner2.asUser.action(api.project.createProject, {
          name: "project-name-3",
          encryptedProjectKey: ePK3,
        });
        const { projectId: p4Id } = await owner.asUser.action(api.project.createProject, {
          name: "project-name-4",
          encryptedProjectKey: ePK4,
        });
        const { projectId: p5Id } = await owner.asUser.action(api.project.createProject, {
          name: "project-name-5",
          encryptedProjectKey: ePK5,
        });

        const encryptedProjectK1ForOwner = await wrapAESKeyWithRSA(
          pK1,
          await importPublicKey(owner.publicKey!),
        );
        const { shareId: share1Id } = await owner2.asUser.action(api.projectShare.shareProject, {
          encryptedProjectKey: encryptedProjectK1ForOwner,
          projectId: p1Id,
          userEmail: owner.email,
        });
        const encryptedProjectK2ForOwner = await wrapAESKeyWithRSA(
          pK2,
          await importPublicKey(owner.publicKey!),
        );
        const { shareId: share2Id } = await owner2.asUser.action(api.projectShare.shareProject, {
          encryptedProjectKey: encryptedProjectK2ForOwner,
          projectId: p2Id,
          userEmail: owner.email,
        });
        const encryptedProjectK3ForOwner = await wrapAESKeyWithRSA(
          pK3,
          await importPublicKey(owner.publicKey!),
        );
        const { shareId: share3Id } = await owner2.asUser.action(api.projectShare.shareProject, {
          encryptedProjectKey: encryptedProjectK3ForOwner,
          projectId: p3Id,
          userEmail: owner.email,
        });

        // NOTE: rotating user keys
        const {
          encryptedPrivateKey: newEncryptedPrivateKey,
          publicKey: newPublicKey,
          salt: newSalt,
        } = await createUserKeys(owner.password!);

        const importedNewPublicKey = await importPublicKey(newPublicKey);

        // NOTE: owner tries to update the project which they are not the owner of
        await expectConvexError(
          () =>
            owner.asUser.mutation(api.userKey.rotateUserKeys, {
              newEncryptedPrivateKey,
              newPublicKey,
              newSalt,
              rewrappedOwnedProjects: [
                {
                  projectId: p1Id,
                  newEncryptedProjectKey: "random-pk",
                },
              ],
              rewrappedShares: [],
            }),
          ErrorCode.INSUFFICIENT_PERMISSION,
        );

        // NOTE: owner2 tries to update the share that's related to the project that he is the owner of
        // however we don't let this happen
        await expectConvexError(
          () =>
            owner2.asUser.mutation(api.userKey.rotateUserKeys, {
              newEncryptedPrivateKey,
              newPublicKey,
              newSalt,
              rewrappedOwnedProjects: [],
              rewrappedShares: [
                {
                  newEncryptedProjectKey: "",
                  shareId: share1Id,
                },
              ],
            }),
          ErrorCode.INSUFFICIENT_PERMISSION,
        );

        const rewrappedP4Key = await wrapAESKeyWithRSA(pK4, importedNewPublicKey);
        const rewrappedP5Key = await wrapAESKeyWithRSA(pK5, importedNewPublicKey);
        const rewrappedShare1Key = await wrapAESKeyWithRSA(pK1, importedNewPublicKey);
        const rewrappedShare2Key = await wrapAESKeyWithRSA(pK2, importedNewPublicKey);
        const rewrappedShare3Key = await wrapAESKeyWithRSA(pK3, importedNewPublicKey);

        await owner.asUser.mutation(api.userKey.rotateUserKeys, {
          newEncryptedPrivateKey,
          newPublicKey,
          newSalt,
          rewrappedOwnedProjects: [
            {
              projectId: p4Id,
              newEncryptedProjectKey: rewrappedP4Key,
            },
            {
              projectId: p5Id,
              newEncryptedProjectKey: rewrappedP5Key,
            },
          ],
          rewrappedShares: [
            {
              newEncryptedProjectKey: rewrappedShare1Key,
              shareId: share1Id,
            },
            {
              newEncryptedProjectKey: rewrappedShare2Key,
              shareId: share2Id,
            },
            {
              newEncryptedProjectKey: rewrappedShare3Key,
              shareId: share3Id,
            },
          ],
        });

        const updatedUser = await owner.asUser.query(api.user.getCurrentUser, {});
        expect(updatedUser.publicKey).toBe(newPublicKey);
        expect(updatedUser.encryptedPrivateKey).toBe(newEncryptedPrivateKey);
        expect(updatedUser.salt).toBe(newSalt);

        const updatedProject4 = await owner.asUser.query(internal.project._loadProjectById, {
          projectId: p4Id,
        });
        expect(updatedProject4.encryptedProjectKey).toBe(rewrappedP4Key);

        const updatedProject5 = await owner.asUser.query(internal.project._loadProjectById, {
          projectId: p5Id,
        });
        expect(updatedProject5.encryptedProjectKey).toBe(rewrappedP5Key);

        const updatedShare1 = await owner.asUser.query(
          api.projectShare.getProjectShareByProjectForCurrentUser,
          { projectId: p1Id },
        );
        expect(updatedShare1.encryptedProjectKey).toBe(rewrappedShare1Key);

        const updatedShare2 = await owner.asUser.query(
          api.projectShare.getProjectShareByProjectForCurrentUser,
          { projectId: p2Id },
        );
        expect(updatedShare2.encryptedProjectKey).toBe(rewrappedShare2Key);

        const updatedShare3 = await owner.asUser.query(
          api.projectShare.getProjectShareByProjectForCurrentUser,
          { projectId: p3Id },
        );
        expect(updatedShare3.encryptedProjectKey).toBe(rewrappedShare3Key);
      });
    });

    test("should update master password successfully", async () => {
      const newPassword = "password" + randomString();

      const newEncryptedPrivateKey = await encryptPrivateKeyWithPassword(
        owner.privateKey!,
        newPassword,
        owner.salt!,
      );

      await owner.asUser.mutation(api.userKey.updatePassword, {
        newEncryptedPrivateKey,
        newSalt: owner.salt!,
      });

      const updatedOwner = await owner.asUser.query(api.user.getCurrentUser, {});

      expect(updatedOwner.encryptedPrivateKey!).toBe(newEncryptedPrivateKey);

      const decryptedNewEncryptedPrivateKey = await decryptPrivateKeyWithPassword(
        updatedOwner.encryptedPrivateKey!,
        newPassword,
        owner.salt!,
      );

      const exportedNewPrivateKey = await exportPrivateKey(decryptedNewEncryptedPrivateKey);
      const exportedOriginalPrivateKey = await exportPrivateKey(owner.privateKey!);

      expect(exportedNewPrivateKey).toBe(exportedOriginalPrivateKey);
    });
  });
});
