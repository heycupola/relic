import { createProjectKey, encryptSecret } from "@repo/crypto";
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";
import {
  betterAuthModules,
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
}): Id<"project"> {
  if (result.status !== "success" || !result.projectId) {
    throw new Error(`Project creation failed: ${result.message || "Unknown error"}`);
  }
  return result.projectId as Id<"project">;
}

describe("Cache", () => {
  let t: TestConvex<typeof schema>;
  let testUsers: TestUser[] = [];
  let owner: TestUser;

  beforeEach(async () => {
    t = convexTest(schema, modules);

    const betterAuthSchema = await import("../convex/betterAuth/generatedSchema.ts");
    t.registerComponent("betterAuth", betterAuthSchema.default, betterAuthModules);

    testUsers = await getTestUsers(t);
    owner = testUsers[0]!;

    mockAutumn.setFeature(owner.userId, "projects", 5);
  });

  afterEach(() => {
    mockAutumn.reset();
  });

  describe("Timestamp propagation", () => {
    test("should bump environment updatedAt on root-level secret change", async () => {
      const { encryptedProjectKey, projectKey } = await createProjectKey(owner.publicKey!);

      const projectResult = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project_" + randomString(),
      });
      const projectId = assertProjectCreated(projectResult);

      const { id: environmentId } = await owner.asUser.mutation(api.environment.createEnvironment, {
        name: "environment_" + randomString(),
        projectId,
      });

      const envBefore = await t.run(async (ctx) => ctx.db.get(environmentId));
      await new Promise((resolve) => setTimeout(resolve, 10));

      const encryptedValue = await encryptSecret(projectKey, "test-value");
      await owner.asUser.mutation(api.secret.createSecret, {
        encryptedValue,
        environmentId,
        key: "ROOT_KEY_" + randomString(),
        valueType: "string",
        folderId: undefined,
      });

      const envAfter = await t.run(async (ctx) => ctx.db.get(environmentId));
      expect(envAfter!.updatedAt).toBeGreaterThan(envBefore!.updatedAt);
    });

    test("should bump folder updatedAt on folder-level secret change", async () => {
      const { encryptedProjectKey, projectKey } = await createProjectKey(owner.publicKey!);

      const projectResult = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project_" + randomString(),
      });
      const projectId = assertProjectCreated(projectResult);

      const { id: environmentId } = await owner.asUser.mutation(api.environment.createEnvironment, {
        name: "environment_" + randomString(),
        projectId,
      });

      const { id: folderId } = await owner.asUser.mutation(api.folder.createFolder, {
        environmentId,
        name: "folder_" + randomString(),
      });

      const folderBefore = await t.run(async (ctx) => ctx.db.get(folderId));
      await new Promise((resolve) => setTimeout(resolve, 10));

      const encryptedValue = await encryptSecret(projectKey, "folder-value");
      await owner.asUser.mutation(api.secret.createSecret, {
        encryptedValue,
        environmentId,
        key: "FOLDER_KEY_" + randomString(),
        valueType: "string",
        folderId,
      });

      const folderAfter = await t.run(async (ctx) => ctx.db.get(folderId));
      expect(folderAfter!.updatedAt).toBeGreaterThan(folderBefore!.updatedAt);
    });
  });

  describe("Scope isolation", () => {
    test("should NOT bump environment updatedAt when a folder secret changes", async () => {
      const { encryptedProjectKey, projectKey } = await createProjectKey(owner.publicKey!);

      const projectResult = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project_" + randomString(),
      });
      const projectId = assertProjectCreated(projectResult);

      const { id: environmentId } = await owner.asUser.mutation(api.environment.createEnvironment, {
        name: "environment_" + randomString(),
        projectId,
      });

      const { id: folderId } = await owner.asUser.mutation(api.folder.createFolder, {
        environmentId,
        name: "folder_" + randomString(),
      });

      const envBefore = await t.run(async (ctx) => ctx.db.get(environmentId));
      await new Promise((resolve) => setTimeout(resolve, 10));

      const encryptedValue = await encryptSecret(projectKey, "folder-only-value");
      await owner.asUser.mutation(api.secret.createSecret, {
        encryptedValue,
        environmentId,
        key: "FOLDER_ONLY_KEY_" + randomString(),
        valueType: "string",
        folderId,
      });

      const envAfter = await t.run(async (ctx) => ctx.db.get(environmentId));
      expect(envAfter!.updatedAt).toBe(envBefore!.updatedAt);
    });

    test("should NOT bump folder X updatedAt when folder Y secret changes", async () => {
      const { encryptedProjectKey, projectKey } = await createProjectKey(owner.publicKey!);

      const projectResult = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project_" + randomString(),
      });
      const projectId = assertProjectCreated(projectResult);

      const { id: environmentId } = await owner.asUser.mutation(api.environment.createEnvironment, {
        name: "environment_" + randomString(),
        projectId,
      });

      const { id: folderXId } = await owner.asUser.mutation(api.folder.createFolder, {
        environmentId,
        name: "folderX_" + randomString(),
      });

      const { id: folderYId } = await owner.asUser.mutation(api.folder.createFolder, {
        environmentId,
        name: "folderY_" + randomString(),
      });

      const folderXBefore = await t.run(async (ctx) => ctx.db.get(folderXId));
      await new Promise((resolve) => setTimeout(resolve, 10));

      const encryptedValue = await encryptSecret(projectKey, "folder-y-value");
      await owner.asUser.mutation(api.secret.createSecret, {
        encryptedValue,
        environmentId,
        key: "FOLDER_Y_KEY_" + randomString(),
        valueType: "string",
        folderId: folderYId,
      });

      const folderXAfter = await t.run(async (ctx) => ctx.db.get(folderXId));
      expect(folderXAfter!.updatedAt).toBe(folderXBefore!.updatedAt);
    });
  });

  describe("Project-wide invalidation", () => {
    test("should bump all environments and folders in a project", async () => {
      const { encryptedProjectKey } = await createProjectKey(owner.publicKey!);

      const projectResult = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project_" + randomString(),
      });
      const projectId = assertProjectCreated(projectResult);

      const { id: env1Id } = await owner.asUser.mutation(api.environment.createEnvironment, {
        name: "env1_" + randomString(),
        projectId,
      });

      const { id: env2Id } = await owner.asUser.mutation(api.environment.createEnvironment, {
        name: "env2_" + randomString(),
        projectId,
      });

      const { id: folderId } = await owner.asUser.mutation(api.folder.createFolder, {
        environmentId: env1Id,
        name: "folder_" + randomString(),
      });

      const env1Before = await t.run(async (ctx) => ctx.db.get(env1Id));
      const env2Before = await t.run(async (ctx) => ctx.db.get(env2Id));
      const folderBefore = await t.run(async (ctx) => ctx.db.get(folderId));

      await new Promise((resolve) => setTimeout(resolve, 10));

      await t.run(async (ctx) => {
        await ctx.runMutation(internal.environment._invalidateProjectCache, { projectId });
      });

      const env1After = await t.run(async (ctx) => ctx.db.get(env1Id));
      const env2After = await t.run(async (ctx) => ctx.db.get(env2Id));
      const folderAfter = await t.run(async (ctx) => ctx.db.get(folderId));

      expect(env1After!.updatedAt).toBeGreaterThan(env1Before!.updatedAt);
      expect(env2After!.updatedAt).toBeGreaterThan(env2Before!.updatedAt);
      expect(folderAfter!.updatedAt).toBeGreaterThan(folderBefore!.updatedAt);
    });
  });

  describe("Validation query", () => {
    test("should return updatedAt for environment or folder", async () => {
      const { encryptedProjectKey } = await createProjectKey(owner.publicKey!);

      const projectResult = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project_" + randomString(),
      });
      const projectId = assertProjectCreated(projectResult);

      const { id: environmentId } = await owner.asUser.mutation(api.environment.createEnvironment, {
        name: "environment_" + randomString(),
        projectId,
      });

      const { id: folderId } = await owner.asUser.mutation(api.folder.createFolder, {
        environmentId,
        name: "folder_" + randomString(),
      });

      const envResult = await owner.asUser.query(api.environment.getCacheValidation, {
        environmentId,
      });
      expect(envResult).not.toBeNull();
      expect(envResult!.updatedAt).toBeGreaterThan(0);

      const folderResult = await owner.asUser.query(api.environment.getCacheValidation, {
        folderId,
      });
      expect(folderResult).not.toBeNull();
      expect(folderResult!.updatedAt).toBeGreaterThan(0);

      const emptyResult = await owner.asUser.query(api.environment.getCacheValidation, {});
      expect(emptyResult).toBeNull();
    });
  });
});
