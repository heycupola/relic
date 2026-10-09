import { createProjectKey } from "@repo/crypto";
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { api, components, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { ErrorCode } from "../convex/lib/errors.ts";
import schema from "../convex/schema";
import {
  betterAuthModules,
  expectConvexError,
  getTestUsers,
  mockBilling,
  modules,
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
    mockBilling.reset();
  });

  describe("CRUD Operations", () => {
    beforeEach(async () => {
      await setPlan(t, owner.userId, "pro");
      await setPlan(t, collaborator.userId, "pro");
    });

    test("should get project limits successfully", async () => {
      await setPlan(t, owner.userId, "pro");

      await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey: "#",
        name: "#",
      });

      const limits = await owner.asUser.action(api.project.getLimits, {});

      expect(limits.includedUsage).toBe(5);
      expect(limits.usage).toBe(1);
    });

    test("free users are asked to upgrade for a second project", async () => {
      await nonCollaborator.asUser.action(api.project.createProject, {
        encryptedProjectKey: "epk",
        name: "first",
      });

      const result = await nonCollaborator.asUser.action(api.project.createProject, {
        encryptedProjectKey: "epk",
        name: "second",
        confirmPayment: true,
      });

      expect(result.status).toBe("requiresProPlan");
      if (result.status === "requiresProPlan") {
        expect(result.checkoutUrl).toContain(nonCollaborator.userId);
      }
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

      const limits = await owner.asUser.action(api.project.getProjectLimits, {});
      expect(limits.totalProjectsCount).toBe(1);
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

      const limits = await owner.asUser.action(api.project.getProjectLimits, {});
      expect(limits.totalProjectsCount).toBe(0);
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

      const limits = await owner.asUser.action(api.project.getProjectLimits, {});
      expect(limits.totalProjectsCount).toBe(1);
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

      const limits = await owner.asUser.action(api.project.getProjectLimits, {});
      expect(limits.totalProjectsCount).toBe(2);
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

    test("free users cannot unarchive past their project quota", async () => {
      const first = assertProjectCreated(
        await nonCollaborator.asUser.action(api.project.createProject, {
          encryptedProjectKey: "epk",
          name: "project-name-1",
        }),
      );
      await nonCollaborator.asUser.action(api.project.archiveProject, { projectId: first });

      assertProjectCreated(
        await nonCollaborator.asUser.action(api.project.createProject, {
          encryptedProjectKey: "epk",
          name: "project-name-2",
        }),
      );

      await expectConvexError(
        () => nonCollaborator.asUser.action(api.project.unarchiveProject, { projectId: first }),
        ErrorCode.PROJECTS_LIMIT_REACHED,
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
      await setPlan(t, owner.userId, "pro");

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
      await setPlan(t, owner.userId, "pro");
      await setPlan(t, collaborator.userId, "pro");
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
      await setPlan(t, owner.userId, "pro");

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
    async function createProjects(count: number) {
      const ids: Id<"project">[] = [];
      for (let i = 0; i < count; i++) {
        ids.push(
          assertProjectCreated(
            await owner.asUser.action(api.project.createProject, {
              encryptedProjectKey: "epk",
              name: `project-${i}`,
              confirmPayment: true,
            }),
          ),
        );
        await t.run(async (ctx) => {
          await ctx.db.patch(ids[i]!, { createdAt: 1_000 + i });
        });
      }
      return ids;
    }

    async function expireGracePeriod() {
      await t.run(async (ctx) => {
        await ctx.runMutation(components.betterAuth.adapter.updateOne, {
          input: {
            model: "user",
            where: [{ field: "_id", value: owner.userId }],
            update: { planDowngradedAt: Date.now() - 8 * 24 * 60 * 60 * 1000 },
          },
        });
      });
    }

    beforeEach(async () => {
      await setPlan(t, owner.userId, "pro");
    });

    test("cancelled users keep their projects during the grace period", async () => {
      await createProjects(3);
      await setPlan(t, owner.userId, "free");

      const list = await owner.asUser.query(api.project.listUserProjects, {});
      expect(list.isInGracePeriod).toBe(true);
      expect(list.gracePeriodDaysRemaining).toBe(7);
      expect(list.projects.every((p) => p.status === "owned")).toBe(true);

      const result = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey: "epk",
        name: "new-project",
        confirmPayment: true,
      });
      expect(result.status).toBe("requiresProPlan");
    });

    test("only the newest project stays unlocked after the grace period", async () => {
      const ids = await createProjects(3);
      await setPlan(t, owner.userId, "free");
      await expireGracePeriod();

      const list = await owner.asUser.query(api.project.listUserProjects, {});
      expect(list.isInGracePeriod).toBe(false);

      const statusById = Object.fromEntries(list.projects.map((p) => [p.id, p.status]));
      expect(statusById[ids[2]!]).toBe("owned");
      expect(statusById[ids[0]!]).toBe("restricted");
      expect(statusById[ids[1]!]).toBe("restricted");
    });

    test("upgrading again lifts the restriction", async () => {
      await createProjects(3);
      await setPlan(t, owner.userId, "free");
      await expireGracePeriod();
      await setPlan(t, owner.userId, "pro");

      const list = await owner.asUser.query(api.project.listUserProjects, {});
      expect(list.projects.every((p) => p.status === "owned")).toBe(true);
    });

    test("archiving frees a slot for a cancelled user", async () => {
      const ids = await createProjects(2);
      await setPlan(t, owner.userId, "free");

      await owner.asUser.action(api.project.archiveProject, { projectId: ids[0]! });
      await owner.asUser.action(api.project.archiveProject, { projectId: ids[1]! });

      const result = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey: "epk",
        name: "new-project",
      });
      expect(result.status).toBe("success");
    });
  });
});
