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

      expect(limits.included_usage).toBe(10);
      expect(limits.usage).toBe(1);
    });

    test("fails when project limit is exceeded", async () => {
      mockAutumn.setFeature(owner.userId, "projects", 1, 1);

      const result = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey: "epk",
        name: "project-name",
        confirmPayment: true,
      });

      expect(result.success).toBe(false);
      expect(result.requiresProPlan).toBe(true);
    });

    test("should create a project with encrypted project key", async () => {
      const { encryptedProjectKey } = await createProjectKey(owner.publicKey!);

      const result = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project-name",
      });

      expect(result.success).toBe(true);
      if (!result.projectId) {
        throw new Error("Project ID is missing");
      }

      const project = await owner.asUser.query(api.project.getProject, {
        projectId: result.projectId,
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

      expect(result.success).toBe(true);
      if (!result.projectId) {
        throw new Error("Project ID is missing");
      }

      await owner.asUser.mutation(api.project.updateProject, {
        projectId: result.projectId,
        name: "new-project-name",
      });

      const project = await owner.asUser.query(api.project.getProject, {
        projectId: result.projectId,
      });

      expect(project.name).toBe("new-project-name");
    });

    test("should archive a project", async () => {
      const { encryptedProjectKey } = await createProjectKey(owner.publicKey!);

      const result = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project-name",
      });

      expect(result.success).toBe(true);
      if (!result.projectId) {
        throw new Error("Project ID is missing");
      }

      await owner.asUser.action(api.project.archiveProject, {
        projectId: result.projectId,
      });

      await expectConvexError(
        () =>
          owner.asUser.query(api.project.getProject, {
            projectId: result.projectId,
          }),
        ErrorCode.PROJECT_INACCESSIBLE,
        "archived",
      );

      const project = await t.run(async (ctx) => {
        return await ctx.db
          .query("project")
          .filter((q) => q.eq(q.field("_id"), result.projectId))
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

      expect(result.success).toBe(true);
      if (!result.projectId) {
        throw new Error("Project ID is missing");
      }

      await owner.asUser.action(api.project.archiveProject, {
        projectId: result.projectId,
      });

      const archivedProject = await t.run(async (ctx) => {
        return await ctx.db
          .query("project")
          .filter((q) => q.eq(q.field("_id"), result.projectId))
          .first();
      });

      expect(archivedProject?.isArchived).toBe(true);

      await owner.asUser.action(api.project.unarchiveProject, {
        projectId: result.projectId,
      });

      const unarchivedProject = await owner.asUser.query(api.project.getProject, {
        projectId: result.projectId,
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

      if (!projectResult1.success) {
        throw new Error(`Project 1 creation failed: ${projectResult1.message || "Unknown error"}`);
      }

      const projectResult2 = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey: ePK2,
        name: "project-name-2",
        confirmPayment: true,
      });

      if (!projectResult2.success) {
        throw new Error(`Project 2 creation failed: ${projectResult2.message || "Unknown error"}`);
      }

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

      if (!projectResult.success || !projectResult.projectId) {
        throw new Error(`Project creation failed: ${projectResult.message || "Unknown error"}`);
      }

      await owner.asUser.action(api.project.archiveProject, { projectId: projectResult.projectId });

      await expectConvexError(
        () =>
          owner.asUser.action(api.project.archiveProject, {
            projectId: projectResult.projectId,
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

      if (!projectResult.success || !projectResult.projectId) {
        throw new Error(`Project creation failed: ${projectResult.message || "Unknown error"}`);
      }

      await owner.asUser.action(api.project.archiveProject, { projectId: projectResult.projectId });

      await expectConvexError(
        () =>
          owner.asUser.mutation(api.project.updateProject, {
            projectId: projectResult.projectId,
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

      if (!projectResult1.success || !projectResult1.projectId) {
        throw new Error(`Project creation failed: ${projectResult1.message || "Unknown error"}`);
      }

      await owner.asUser.action(api.project.archiveProject, {
        projectId: projectResult1.projectId,
      });

      const { encryptedProjectKey: ePK2 } = await createProjectKey(owner.publicKey!);

      const projectResult2 = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey: ePK2,
        name: "project-name-2",
      });

      if (!projectResult2.success || !projectResult2.projectId) {
        throw new Error(`Project creation failed: ${projectResult2.message || "Unknown error"}`);
      }

      await expectConvexError(
        () =>
          owner.asUser.action(api.project.unarchiveProject, {
            projectId: projectResult1.projectId,
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

      if (!projectResult.success || !projectResult.projectId) {
        throw new Error(`Project creation failed: ${projectResult.message || "Unknown error"}`);
      }

      await expectConvexError(
        () =>
          nonCollaborator.asUser.query(api.project.getProject, {
            projectId: projectResult.projectId,
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

      if (!projectResult.success || !projectResult.projectId) {
        throw new Error(`Project creation failed: ${projectResult.message || "Unknown error"}`);
      }

      const { encryptedProjectKey: newKey } = await createProjectKey(owner.publicKey!);

      await t.run(async (ctx) => {
        await ctx.runMutation(internal.project._rotateProjectKey, {
          projectId: projectResult.projectId,
          newEncryptedProjectKey: newKey,
          newKeyVersion: 2,
        });
      });

      const project = await owner.asUser.query(api.project.getProject, {
        projectId: projectResult.projectId,
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

      if (!projectResult.success || !projectResult.projectId) {
        throw new Error(`Project creation failed: ${projectResult.message || "Unknown error"}`);
      }

      await owner.asUser.action(api.projectShare.shareProject, {
        projectId: projectResult.projectId,
        userEmail: collaborator.email,
        encryptedProjectKey,
      });

      await expectConvexError(
        () =>
          owner.asUser.action(api.project.archiveProject, {
            projectId: projectResult.projectId,
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

      if (!projectResult.success || !projectResult.projectId) {
        throw new Error(`Project creation failed: ${projectResult.message || "Unknown error"}`);
      }

      const { environmentId } = await owner.asUser.mutation(api.environment.createEnvironment, {
        projectId: projectResult.projectId,
        name: "environment-name",
      });

      expect(environmentId).toBeDefined();

      const environment = await owner.asUser.query(api.environment.getProjectEnvironments, {
        projectId: projectResult.projectId,
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

      if (!projectResult.success || !projectResult.projectId) {
        throw new Error(`Project creation failed: ${projectResult.message || "Unknown error"}`);
      }

      await owner.asUser.action(api.project.archiveProject, { projectId: projectResult.projectId });

      await expectConvexError(
        () =>
          owner.asUser.mutation(api.environment.createEnvironment, {
            projectId: projectResult.projectId,
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

      if (!projectResult.success || !projectResult.projectId) {
        throw new Error(`Project creation failed: ${projectResult.message || "Unknown error"}`);
      }

      await expectConvexError(
        () =>
          nonCollaborator.asUser.query(api.environment.getProjectEnvironments, {
            projectId: projectResult.projectId,
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

      if (!projectResult.success || !projectResult.projectId) {
        throw new Error(`Project creation failed: ${projectResult.message || "Unknown error"}`);
      }

      await owner.asUser.action(api.projectShare.shareProject, {
        projectId: projectResult.projectId,
        userEmail: collaborator.email,
        encryptedProjectKey,
      });

      const { environmentId } = await owner.asUser.mutation(api.environment.createEnvironment, {
        projectId: projectResult.projectId,
        name: "environment-name",
      });

      const environment = await collaborator.asUser.query(api.environment.getProjectEnvironments, {
        projectId: projectResult.projectId,
      });

      expect(environment).toBeDefined();
      expect(environmentId).toBeDefined();

      const collaboratorEnvironment = await collaborator.asUser.query(
        api.environment.getProjectEnvironments,
        {
          projectId: projectResult.projectId,
        },
      );

      expect(collaboratorEnvironment).toBeDefined();
      expect(collaboratorEnvironment.length).toBe(1);
      expect(collaboratorEnvironment[0].name).toBe("environment-name");
    });
  });
});
