import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, components, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { ErrorCode } from "../convex/lib/errors.ts";
import schema from "../convex/schema";
import { createProjectKey, decryptSecret, encryptSecret } from "./helpers/crypto";
import {
  betterAuthModules,
  expectConvexError,
  getTestUsers,
  mockAutumn,
  modules,
  randomString,
  type TestUser,
} from "./setup";

describe("Secret Management", () => {
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
      mockAutumn.setFeature(owner.userId, "projects", 2);
      mockAutumn.setFeature(collaborator.userId, "projects", 2);
    });

    test("should create secrets with different primitive types", async () => {
      const { encryptedProjectKey, projectKey } = await createProjectKey(owner.publicKey!);

      const { projectId } = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project_" + randomString(),
      });

      const { environmentId } = await owner.asUser.mutation(api.environment.createEnvironment, {
        name: "environment_" + randomString(),
        projectId,
      });

      const valueTypes: ("string" | "number" | "boolean")[] = ["string", "number", "boolean"];
      const keys = ["key_1", "key_2", "key_3"];
      const values = ["hello", "1", "false"];

      const secretIds: Id<"secret">[] = [];

      let i = 0;
      for (i; i < 3; ++i) {
        const encryptedValue = await encryptSecret(projectKey, values[i]);

        const { secretId } = await owner.asUser.mutation(api.secret.createSecret, {
          encryptedValue,
          encryptionKeyVersion: 1,
          environmentId,
          key: keys[i],
          valueType: valueTypes[i],
          folderId: undefined,
        });

        secretIds.push(secretId);
      }

      i = 0;
      for (i; i < 3; ++i) {
        const { encryptedValue } = await owner.asUser.query(api.secret.getSecret, {
          secretId: secretIds[i],
        });

        const secretValue = await decryptSecret(projectKey, encryptedValue);
        expect(secretValue).toBe(values[i]);
      }
    });

    test("should delete cascade to folders", async () => {
      const { encryptedProjectKey, projectKey } = await createProjectKey(owner.publicKey!);

      const { projectId } = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project_" + randomString(),
      });

      const { environmentId } = await owner.asUser.mutation(api.environment.createEnvironment, {
        name: "environment_" + randomString(),
        projectId,
      });

      const { folderId } = await owner.asUser.mutation(api.folder.createFolder, {
        environmentId,
        name: "folder_" + randomString(),
      });

      const values = ["hello", "there", "how", "are", "you"];

      const secretIds: Id<"secret">[] = [];

      let i = 0;
      for (i; i < 3; ++i) {
        const encryptedValue = await encryptSecret(projectKey, values[i]);

        const { secretId } = await owner.asUser.mutation(api.secret.createSecret, {
          encryptedValue,
          encryptionKeyVersion: 1,
          environmentId,
          key: "key_" + randomString(),
          valueType: "string",
          folderId,
        });

        secretIds.push(secretId);
      }

      await expectConvexError(
        () =>
          owner.asUser.mutation(api.environment.deleteEnvironment, {
            environmentId,
          }),
        ErrorCode.CANNOT_DELETE_NON_EMPTY,
      );

      await expectConvexError(
        () =>
          owner.asUser.mutation(api.folder.deleteFolder, {
            folderId,
          }),
        ErrorCode.CANNOT_DELETE_NON_EMPTY,
      );

      i = 0;
      for (i; i < 3; ++i) {
        await owner.asUser.mutation(api.secret.deleteSecret, {
          secretId: secretIds[i],
        });
      }

      await owner.asUser.mutation(api.folder.deleteFolder, {
        folderId,
      });

      await owner.asUser.mutation(api.environment.deleteEnvironment, {
        environmentId,
      });

      await t.run(async (ctx) => {
        const environment = await ctx.db.get(environmentId);
        const folder = await ctx.db.get(folderId);

        expect(environment).toBeNull();
        expect(folder).toBeNull();
      });
    });
  });
});
