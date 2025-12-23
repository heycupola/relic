import { ConvexError } from "convex/values";
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { api, components } from "../_generated/api";
import { ErrorCode } from "../lib/errors.ts";
import schema from "../schema";
import { createProjectKey } from "./helpers/crypto";
import { betterAuthModules, getTestUsers, mockAutumn, modules, type TestUser } from "./setup";

describe("Project Lifecycle", () => {
  let t: TestConvex<typeof schema>;
  let testUsers: TestUser[] = [];
  let owner: TestUser, collaborator: TestUser;

  beforeEach(async () => {
    t = convexTest(schema, modules);

    const betterAuthSchema = await import("../betterAuth/generatedSchema.ts");
    t.registerComponent("betterAuth", betterAuthSchema.default, betterAuthModules);

    testUsers = await getTestUsers(t);
    owner = testUsers[0]!;
    collaborator = testUsers[1]!;
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

      try {
        await owner.asUser.action(api.project.createProject, {
          encryptedProjectKey: "epk",
          name: "project-name",
        });
        throw new Error("Expected error to be thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(ConvexError);

        if (err instanceof ConvexError) {
          const errorData = typeof err.data === "string" ? JSON.parse(err.data) : err.data;
          expect(errorData.code).toBe(ErrorCode.PROJECTS_LIMIT_REACHED);
          expect(errorData.message).toContain("Limit reached");
        }
      }
    });

    test("should create a project with encrypted project key", async () => {
      const ownerUser = await owner.asUser.run(async (ctx) => {
        return await ctx.runQuery(components.betterAuth.user.loadUserById, {
          userId: owner.userId,
        });
      });

      const { encryptedProjectKey: ePK1 } = await createProjectKey(ownerUser.publicKey!);

      const result = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey: ePK1,
        name: "project-name",
      });

      const project = await owner.asUser.query(api.project.getProject, {
        projectId: result.projectId,
      });

      expect(result.success).toBe(true);
      expect(project.encryptedProjectKey).toBe(ePK1);
      expect(project.keyVersion).toBe(1);

      // const { encryptedProjectKey: ePK2 } = await createProjectKey(ownerUser.publicKey!);
      // const { encryptedProjectKey: ePK3 } = await createProjectKey(ownerUser.publicKey!);
    });
  });
});
