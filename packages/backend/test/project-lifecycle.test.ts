import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { api, internal } from "../convex/_generated/api";
import { ErrorCode } from "../convex/lib/errors.ts";
import schema from "../convex/schema";
import { createProjectKey } from "./helpers/crypto";
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

  describe("Project Lifecycle", () => {
    beforeEach(async () => {
      mockAutumn.setFeature(owner.userId, "projects", 2);
      mockAutumn.setFeature(collaborator.userId, "projects", 2);
    });

    test("fails when project limit is exceeded", async () => {
      mockAutumn.setFeature(owner.userId, "projects", 0);

      await expectConvexError(
        () =>
          owner.asUser.action(api.project.createProject, {
            encryptedProjectKey: "epk",
            name: "project-name",
          }),
        ErrorCode.PROJECTS_LIMIT_REACHED,
        "Limit reached",
      );
    });

    test("should create a project with encrypted project key", async () => {
      const { encryptedProjectKey } = await createProjectKey(owner.publicKey!);

      const result = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project-name",
      });

      const project = await owner.asUser.query(api.project.getProject, {
        projectId: result.projectId,
      });

      expect(result.success).toBe(true);
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

      await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey: ePK1,
        name: "project-name-1",
      });

      await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey: ePK2,
        name: "project-name-2",
      });

      const result = await owner.asUser.query(api.project.listUserProjects);

      expect(result.projects.length).toBe(2);
      expect(result.gracePeriodDaysRemaining).toBe(undefined);
      expect(result.isInGracePeriod).toBe(false);

      const projectsQuota = mockAutumn.getUserFeature(owner.userId, "projects");
      expect(projectsQuota?.current).toBe(2);
    });

    test("shoud not archive an archived project", async () => {
      const { encryptedProjectKey } = await createProjectKey(owner.publicKey!);

      const { projectId } = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project-name",
      });

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

      const { projectId } = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project-name",
      });

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

      const { projectId: pId1 } = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey: ePK1,
        name: "project-name-1",
      });

      await owner.asUser.action(api.project.archiveProject, { projectId: pId1 });

      const { encryptedProjectKey: ePK2 } = await createProjectKey(owner.publicKey!);

      const { projectId: _pId2 } = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey: ePK2,
        name: "project-name-2",
      });

      await expectConvexError(
        () =>
          owner.asUser.action(api.project.unarchiveProject, {
            projectId: pId1,
          }),
        ErrorCode.PROJECTS_LIMIT_REACHED,
        "Limit reached",
      );
    });

    test("should not fetch a project of other user", async () => {
      const { encryptedProjectKey } = await createProjectKey(owner.publicKey!);

      const { projectId } = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project-name",
      });

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

      const { projectId } = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project-name",
      });

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
  });
});
