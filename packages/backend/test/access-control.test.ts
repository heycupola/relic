import { createProjectKey } from "@repo/crypto";
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, components, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { ErrorCode } from "../convex/lib/errors.ts";
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
}): string {
  if (result.status !== "success" || !result.projectId) {
    throw new Error(`Project creation failed: ${result.message || "Unknown error"}`);
  }
  return result.projectId;
}

describe("Access Control", () => {
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

  describe("Project Restrictions", () => {
    beforeEach(async () => {
      mockAutumn.setFeature(owner.userId, "projects", 2);
      mockAutumn.setFeature(collaborator.userId, "projects", 2);
    });

    test("should not access an archived project", async () => {
      const { encryptedProjectKey } = await createProjectKey(owner.publicKey!);

      const projectResult = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project_" + randomString(),
        confirmPayment: true,
      });

      const projectId = assertProjectCreated(projectResult);

      await owner.asUser.action(api.project.archiveProject, { projectId });

      await expectConvexError(
        () => owner.asUser.query(api.project.getProject, { projectId }),
        ErrorCode.PROJECT_INACCESSIBLE,
      );

      await owner.asUser.action(api.project.unarchiveProject, {
        projectId,
      });

      const project = await owner.asUser.query(api.project.getProject, {
        projectId,
      });

      expect(project).toBeDefined();
      expect(project.isArchived).toBe(false);
    });

    test("should get only 2 recent projects after getting restricted", async () => {
      mockAutumn.setFeature(owner.userId, "projects", 8);
      await owner.asUser.mutation(components.betterAuth.user.upgradeToPro, {
        userId: owner.userId,
      });

      const projectNames = Array.from({ length: 6 }, () => "project_" + randomString());
      const projectIds: Id<"project">[] = [];

      for (const projectName of projectNames) {
        const { encryptedProjectKey } = await createProjectKey(owner.publicKey!);

        const projectResult = await owner.asUser.action(api.project.createProject, {
          encryptedProjectKey,
          name: projectName,
          confirmPayment: true,
        });

        projectIds.push(assertProjectCreated(projectResult));
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      const proState = await owner.asUser.query(api.project.listUserProjects, {});

      expect(proState.projects.length).toBe(6);
      expect(proState.isInGracePeriod).toBe(false);
      expect(proState.gracePeriodDaysRemaining).not.toBeDefined();

      mockAutumn.setFeature(owner.userId, "projects", 2);
      await owner.asUser.mutation(components.betterAuth.user.downgradeToFree, {
        userId: owner.userId,
      });

      const graceState = await owner.asUser.query(api.project.listUserProjects, {});

      expect(graceState.projects.length).toBe(6);
      expect(graceState.isInGracePeriod).toBe(true);
      expect(graceState.gracePeriodDaysRemaining).toBe(7);

      vi.useFakeTimers();
      vi.advanceTimersByTime(7 * 24 * 60 * 60 * 1000);

      const restrictedState = await owner.asUser.query(api.project.listUserProjects, {});

      expect(restrictedState.projects.length).toBe(6);
      expect(restrictedState.projects.filter((p) => !p.isRestricted).length).toBe(1);
      expect(restrictedState.projects.filter((p) => p.isRestricted).length).toBe(5);
      expect(restrictedState.isInGracePeriod).toBe(false);
      expect(restrictedState.gracePeriodDaysRemaining).not.toBeDefined();

      vi.useRealTimers();
    });

    test("should block access to shared projects when owner loses pro and project becomes restricted", async () => {
      mockAutumn.setFeature(owner.userId, "projects", 7);
      mockAutumn.setBooleanFeature(owner.userId, "can_share_project", true);
      mockAutumn.setFeature(owner.userId, "additional_shares", 10);
      await owner.asUser.mutation(components.betterAuth.user.upgradeToPro, {
        userId: owner.userId,
      });

      const projectIds: Id<"project">[] = [];

      for (let i = 0; i < 4; i++) {
        const { encryptedProjectKey } = await createProjectKey(owner.publicKey!);
        const projectResult = await owner.asUser.action(api.project.createProject, {
          encryptedProjectKey,
          name: "old_project_" + randomString(),
          confirmPayment: true,
        });

        projectIds.push(assertProjectCreated(projectResult));
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      const oldestProjectId = projectIds[0];

      const shareResult = await owner.asUser.action(api.projectShare.shareProject, {
        encryptedProjectKey: (await createProjectKey(owner.publicKey!)).encryptedProjectKey,
        projectId: oldestProjectId!,
        userEmail: collaborator.email,
        confirmPayment: true,
      });

      if (!shareResult.success) {
        throw new Error(`Share failed: ${shareResult.message || "Unknown error"}`);
      }

      for (let i = 0; i < 2; i++) {
        const { encryptedProjectKey } = await createProjectKey(owner.publicKey!);
        const projectResult = await owner.asUser.action(api.project.createProject, {
          encryptedProjectKey,
          name: "new_project_" + randomString(),
          confirmPayment: true,
        });

        projectIds.push(assertProjectCreated(projectResult));
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      const shareBeforeDowngrade = await collaborator.asUser.query(
        api.projectShare.getProjectShareByProjectForCurrentUser,
        { projectId: oldestProjectId! },
      );

      expect(shareBeforeDowngrade).toBeDefined();

      mockAutumn.setFeature(owner.userId, "projects", 2);
      await owner.asUser.mutation(components.betterAuth.user.downgradeToFree, {
        userId: owner.userId,
      });

      const shareDuringGrace = await collaborator.asUser.query(
        api.projectShare.getProjectShareByProjectForCurrentUser,
        { projectId: oldestProjectId! },
      );

      expect(shareDuringGrace).toBeDefined();

      vi.useFakeTimers();
      vi.advanceTimersByTime(7 * 24 * 60 * 60 * 1000);

      await expectConvexError(
        () =>
          collaborator.asUser.query(api.projectShare.getProjectShareByProjectForCurrentUser, {
            projectId: oldestProjectId!,
          }),
        ErrorCode.PROJECT_INACCESSIBLE,
      );

      vi.useRealTimers();
    });

    test("should allow access to shared projects even when collaborator loses pro", async () => {
      mockAutumn.setFeature(owner.userId, "projects", 2);
      mockAutumn.setBooleanFeature(owner.userId, "can_share_project", true);
      mockAutumn.setFeature(owner.userId, "additional_shares", 1);

      mockAutumn.setFeature(collaborator.userId, "projects", 2);
      await collaborator.asUser.mutation(components.betterAuth.user.upgradeToPro, {
        userId: collaborator.userId,
      });

      const { encryptedProjectKey } = await createProjectKey(owner.publicKey!);

      const projectResult = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project_" + randomString(),
        confirmPayment: true,
      });

      const projectId = assertProjectCreated(projectResult);

      const shareResult = await owner.asUser.action(api.projectShare.shareProject, {
        encryptedProjectKey,
        projectId,
        userEmail: collaborator.email,
        confirmPayment: true,
      });

      if (!shareResult.success) {
        throw new Error(`Share failed: ${shareResult.message || "Unknown error"}`);
      }

      const sharedProject = await collaborator.asUser.query(
        api.projectShare.getProjectShareByProjectForCurrentUser,
        { projectId },
      );

      expect(sharedProject).toBeDefined();
      expect(sharedProject.projectId).toBe(projectId);

      mockAutumn.setFeature(collaborator.userId, "projects", 2);
      await collaborator.asUser.mutation(components.betterAuth.user.downgradeToFree, {
        userId: collaborator.userId,
      });

      vi.useFakeTimers();
      vi.advanceTimersByTime(7 * 24 * 60 * 60 * 1000);

      const shareAfterRestriction = await collaborator.asUser.query(
        api.projectShare.getProjectShareByProjectForCurrentUser,
        { projectId },
      );

      expect(shareAfterRestriction).toBeDefined();
      expect(shareAfterRestriction.projectId).toBe(projectId);

      vi.useRealTimers();
    });
  });
});
