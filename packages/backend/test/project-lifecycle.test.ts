import { createProjectKey } from "@repo/crypto";
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { api, internal } from "../convex/_generated/api";
import { ErrorCode } from "../convex/lib/errors.ts";
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
}): string {
  if (result.status !== "success" || !result.projectId) {
    throw new Error(`Project creation failed: ${result.message || "Unknown error"}`);
  }
  return result.projectId;
}

describe("Project Lifecycle", () => {
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
      mockAutumn.setFeature(owner.userId, "projects", 4);
      mockAutumn.setFeature(collaborator.userId, "projects", 4);
    });

    test("should get project limits successfully", async () => {
      mockAutumn.setFeature(owner.userId, "projects", 10);

      await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey: "#",
        name: "#",
      });

      const limits = await owner.asUser.action(api.project.getLimits, {});

      expect(limits.includedUsage).toBe(10);
      expect(limits.usage).toBe(1);
    });

    test("fails when project limit is exceeded", async () => {
      mockAutumn.setFeature(owner.userId, "projects", 1, 1);

      const result = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey: "epk",
        name: "project-name",
        confirmPayment: true,
      });

      expect(result.status).toBe("requiresProPlan");
    });

    test("should create a project with encrypted project key", async () => {
      const { encryptedProjectKey } = await createProjectKey(owner.publicKey!);

      const result = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project-name",
      });

      const projectId = assertProjectCreated(result);

      const project = await owner.asUser.query(api.project.getProject, {
        projectId,
      });
      expect(project.encryptedProjectKey).toBe(encryptedProjectKey);
      expect(project.keyVersion).toBe(1);

      const projectsQuota = mockAutumn.getUserFeature(owner.userId, "projects");
      expect(projectsQuota?.current).toBe(1);
    });

    test("should update a project", async () => {
      const { encryptedProjectKey } = await createProjectKey(owner.publicKey!);

      const result = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project-name",
      });

      const projectId = assertProjectCreated(result);

      await owner.asUser.mutation(api.project.updateProject, {
        projectId,
        name: "new-project-name",
      });

      const project = await owner.asUser.query(api.project.getProject, {
        projectId,
      });

      expect(project.name).toBe("new-project-name");
    });

    test("should archive a project", async () => {
      const { encryptedProjectKey } = await createProjectKey(owner.publicKey!);

      const result = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project-name",
      });

      const projectId = assertProjectCreated(result);

      await owner.asUser.action(api.project.archiveProject, {
        projectId,
      });

      await expectConvexError(
        () =>
          owner.asUser.query(api.project.getProject, {
            projectId,
          }),
        ErrorCode.PROJECT_INACCESSIBLE,
        "archived",
      );

      const project = await t.run(async (ctx) => {
        return await ctx.db
          .query("project")
          .filter((q) => q.eq(q.field("_id"), projectId))
          .first();
      });

      expect(project?.isArchived).toBe(true);

      const projectsQuota = mockAutumn.getUserFeature(owner.userId, "projects");
      expect(projectsQuota?.current).toBe(0);
    });

    test("should unarchive a project", async () => {
      const { encryptedProjectKey } = await createProjectKey(owner.publicKey!);

      const result = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project-name",
      });

      const projectId = assertProjectCreated(result);

      await owner.asUser.action(api.project.archiveProject, {
        projectId,
      });

      const archivedProject = await t.run(async (ctx) => {
        return await ctx.db
          .query("project")
          .filter((q) => q.eq(q.field("_id"), projectId))
          .first();
      });

      expect(archivedProject?.isArchived).toBe(true);

      await owner.asUser.action(api.project.unarchiveProject, {
        projectId,
      });

      const unarchivedProject = await owner.asUser.query(api.project.getProject, {
        projectId,
      });

      expect(unarchivedProject?.isArchived).toBe(false);

      const projectsQuota = mockAutumn.getUserFeature(owner.userId, "projects");
      expect(projectsQuota?.current).toBe(1);
    });

    test("should list projects", async () => {
      const { encryptedProjectKey: ePK1 } = await createProjectKey(owner.publicKey!);
      const { encryptedProjectKey: ePK2 } = await createProjectKey(owner.publicKey!);

      const projectResult1 = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey: ePK1,
        name: "project-name-1",
        confirmPayment: true,
      });

      assertProjectCreated(projectResult1);

      const projectResult2 = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey: ePK2,
        name: "project-name-2",
        confirmPayment: true,
      });

      assertProjectCreated(projectResult2);

      const result = await owner.asUser.query(api.project.listUserProjects);

      expect(result.projects.length).toBe(2);
      expect(result.gracePeriodDaysRemaining).toBe(undefined);
      expect(result.isInGracePeriod).toBe(false);

      const projectsQuota = mockAutumn.getUserFeature(owner.userId, "projects");
      expect(projectsQuota?.current).toBe(2);
    });

    test("shoud not archive an archived project", async () => {
      const { encryptedProjectKey } = await createProjectKey(owner.publicKey!);

      const projectResult = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project-name",
      });

      const projectId = assertProjectCreated(projectResult);

      await owner.asUser.action(api.project.archiveProject, { projectId });

      await expectConvexError(
        () =>
          owner.asUser.action(api.project.archiveProject, {
            projectId,
          }),
        ErrorCode.PROJECT_INACCESSIBLE,
        "archived",
      );
    });

    test("should not update an archived project", async () => {
      const { encryptedProjectKey } = await createProjectKey(owner.publicKey!);

      const projectResult = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project-name",
      });

      const projectId = assertProjectCreated(projectResult);

      await owner.asUser.action(api.project.archiveProject, { projectId });

      await expectConvexError(
        () =>
          owner.asUser.mutation(api.project.updateProject, {
            projectId,
          }),
        ErrorCode.PROJECT_INACCESSIBLE,
        "archived",
      );
    });

    test("should not unarchive an archived project if there is no project quoate left", async () => {
      mockAutumn.setFeature(owner.userId, "projects", 1, 0);

      const { encryptedProjectKey: ePK1 } = await createProjectKey(owner.publicKey!);

      const projectResult1 = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey: ePK1,
        name: "project-name-1",
      });

      const projectId1 = assertProjectCreated(projectResult1);

      await owner.asUser.action(api.project.archiveProject, {
        projectId: projectId1,
      });

      const { encryptedProjectKey: ePK2 } = await createProjectKey(owner.publicKey!);

      const projectResult2 = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey: ePK2,
        name: "project-name-2",
      });

      assertProjectCreated(projectResult2);

      await expectConvexError(
        () =>
          owner.asUser.action(api.project.unarchiveProject, {
            projectId: projectId1,
          }),
        ErrorCode.PROJECTS_LIMIT_REACHED,
        "Limit reached",
      );
    });

    test("should not fetch a project of other user", async () => {
      const { encryptedProjectKey } = await createProjectKey(owner.publicKey!);

      const projectResult = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project-name",
      });

      const projectId = assertProjectCreated(projectResult);

      await expectConvexError(
        () =>
          nonCollaborator.asUser.query(api.project.getProject, {
            projectId,
          }),
        ErrorCode.INSUFFICIENT_PERMISSION,
        "You don't have permission",
      );
    });

    test("should rotate a project key", async () => {
      const { encryptedProjectKey } = await createProjectKey(owner.publicKey!);

      const projectResult = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project-name",
      });

      const projectId = assertProjectCreated(projectResult);

      const { encryptedProjectKey: newKey } = await createProjectKey(owner.publicKey!);

      await t.run(async (ctx) => {
        await ctx.runMutation(internal.project._rotateProjectKey, {
          projectId,
          newEncryptedProjectKey: newKey,
          newKeyVersion: 2,
        });
      });

      const project = await owner.asUser.query(api.project.getProject, {
        projectId,
      });

      expect(project.keyVersion).toBe(2);
      expect(project.encryptedProjectKey).toBe(newKey);
    });

    test("should not archive project with active shares", async () => {
      mockAutumn.setBooleanFeature(owner.userId, "can_share_project", true);
      mockAutumn.setFeature(owner.userId, "additional_shares", 5);

      const { encryptedProjectKey } = await createProjectKey(owner.publicKey!);

      const projectResult = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project-name",
      });

      const projectId = assertProjectCreated(projectResult);

      await owner.asUser.action(api.projectShare.shareProject, {
        projectId,
        userEmail: collaborator.email,
        encryptedProjectKey,
      });

      await expectConvexError(
        () =>
          owner.asUser.action(api.project.archiveProject, {
            projectId,
          }),
        ErrorCode.INVALID_OPERATION,
        "Cannot archive project with 1 active share(s)",
      );
    });
  });

  describe("Environment CRUD Operations", () => {
    beforeEach(async () => {
      mockAutumn.setFeature(owner.userId, "projects", 2);
      mockAutumn.setFeature(collaborator.userId, "projects", 2);
    });

    test("should create an environment", async () => {
      const { encryptedProjectKey } = await createProjectKey(owner.publicKey!);

      const projectResult = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project-name",
      });

      const projectId = assertProjectCreated(projectResult);

      const { id: environmentId } = await owner.asUser.mutation(api.environment.createEnvironment, {
        projectId,
        name: "environment-name",
      });

      expect(environmentId).toBeDefined();

      const environment = await owner.asUser.query(api.environment.getProjectEnvironments, {
        projectId,
      });

      expect(environment.length).toBe(1);
      expect(environment[0].name).toBe("environment-name");
    });

    test("should not create an environment if the project is archived", async () => {
      const { encryptedProjectKey } = await createProjectKey(owner.publicKey!);

      const projectResult = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project-name",
      });

      const projectId = assertProjectCreated(projectResult);

      await owner.asUser.action(api.project.archiveProject, { projectId });

      await expectConvexError(
        () =>
          owner.asUser.mutation(api.environment.createEnvironment, {
            projectId,
            name: "environment-name",
          }),
        ErrorCode.PROJECT_INACCESSIBLE,
        "archived",
      );
    });

    test("should not get environments if the user has no access to the project", async () => {
      const { encryptedProjectKey } = await createProjectKey(owner.publicKey!);

      const projectResult = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project-name",
      });

      const projectId = assertProjectCreated(projectResult);

      await expectConvexError(
        () =>
          nonCollaborator.asUser.query(api.environment.getProjectEnvironments, {
            projectId,
          }),
        ErrorCode.INSUFFICIENT_PERMISSION,
        "You don't have permission",
      );
    });

    test("should get environments if the user has project share access", async () => {
      mockAutumn.setBooleanFeature(owner.userId, "can_share_project", true);

      const { encryptedProjectKey } = await createProjectKey(owner.publicKey!);

      const projectResult = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project-name",
      });

      const projectId = assertProjectCreated(projectResult);

      await owner.asUser.action(api.projectShare.shareProject, {
        projectId,
        userEmail: collaborator.email,
        encryptedProjectKey,
      });

      const { id: environmentId } = await owner.asUser.mutation(api.environment.createEnvironment, {
        projectId,
        name: "environment-name",
      });

      const environment = await collaborator.asUser.query(api.environment.getProjectEnvironments, {
        projectId,
      });

      expect(environment).toBeDefined();
      expect(environmentId).toBeDefined();

      const collaboratorEnvironment = await collaborator.asUser.query(
        api.environment.getProjectEnvironments,
        {
          projectId,
        },
      );

      expect(collaboratorEnvironment).toBeDefined();
      expect(collaboratorEnvironment.length).toBe(1);
      expect(collaboratorEnvironment[0].name).toBe("environment-name");
    });
  });

  describe("Project Subscription Cancellation", () => {
    beforeEach(async () => {
      mockAutumn.setFeature(owner.userId, "projects", 10);
      mockAutumn.setBooleanFeature(owner.userId, "can_share_project", true);
    });

    test("should block new project when subscription cancelled and over limit", async () => {
      for (let i = 0; i < 10; i++) {
        const { encryptedProjectKey } = await createProjectKey(owner.publicKey!);
        const result = await owner.asUser.action(api.project.createProject, {
          encryptedProjectKey,
          name: `project-${i}`,
          confirmPayment: true,
        });

        if (result.status !== "success") {
          throw new Error(`Project ${i} creation failed: ${result.message || "Unknown error"}`);
        }
      }

      mockAutumn.setFeature(owner.userId, "projects", 7, 10);

      const { encryptedProjectKey } = await createProjectKey(owner.publicKey!);
      const result = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "new-project",
        confirmPayment: true,
      });

      expect(result.status).toBe("requiresRemoval");
      if (result.status === "requiresRemoval") {
        expect(result.currentUsage).toBe(10);
        expect(result.includedUsage).toBe(7);
        expect(result.excessCount).toBe(3);
      }
    });

    test("should allow new project after archiving excess projects", async () => {
      for (let i = 0; i < 8; i++) {
        const { encryptedProjectKey } = await createProjectKey(owner.publicKey!);
        const result = await owner.asUser.action(api.project.createProject, {
          encryptedProjectKey,
          name: `project-${i}`,
          confirmPayment: true,
        });

        if (result.status !== "success") {
          throw new Error(`Project ${i} creation failed: ${result.message || "Unknown error"}`);
        }
      }

      mockAutumn.setFeature(owner.userId, "projects", 6, 8);

      const projects = await owner.asUser.query(api.project.listUserProjects, {});
      const firstProject = projects.projects[0]!;
      const secondProject = projects.projects[1]!;

      mockAutumn.setFeature(owner.userId, "projects", 8, 8);

      await owner.asUser.action(api.project.archiveProject, {
        projectId: firstProject.id,
      });

      mockAutumn.setFeature(owner.userId, "projects", 8, 7);

      await owner.asUser.action(api.project.archiveProject, {
        projectId: secondProject.id,
      });

      mockAutumn.setFeature(owner.userId, "projects", 8, 6);

      const { encryptedProjectKey } = await createProjectKey(owner.publicKey!);
      const result = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "new-project",
        confirmPayment: true,
      });

      expect(result.status).toBe("success");
    });
  });
});
