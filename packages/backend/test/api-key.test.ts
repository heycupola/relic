import { createProjectKey } from "@repo/crypto";
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { api, components } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { API_KEY_PREFIX } from "../convex/lib/crypto";
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

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

function futureExpiry(days = 30): number {
  return Date.now() + days * 24 * 60 * 60 * 1000;
}

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

describe("API Key Management", () => {
  let t: TestConvex<typeof schema>;
  let testUsers: TestUser[] = [];
  let owner: TestUser;
  let otherUser: TestUser;

  beforeEach(async () => {
    t = convexTest(schema, modules);

    const betterAuthSchema = await import("../convex/betterAuth/generatedSchema.ts");
    t.registerComponent("betterAuth", betterAuthSchema.default, betterAuthModules);

    testUsers = await getTestUsers(t);
    owner = testUsers[0]!;
    otherUser = testUsers[1]!;

    await owner.asUser.mutation(components.betterAuth.user.upgradeToPro, {
      userId: owner.userId,
    });
    await otherUser.asUser.mutation(components.betterAuth.user.upgradeToPro, {
      userId: otherUser.userId,
    });
  });

  afterEach(() => {
    mockAutumn.reset();
  });

  describe("Create API Key", () => {
    test("should create an API key with valid scopes", async () => {
      const result = await owner.asUser.mutation(api.apiKey.createApiKey, {
        name: "GitHub Actions",
        scopes: ["secrets.read"],
        expiresAt: futureExpiry(),
      });

      expect(result.apiKey).toBeDefined();
      expect(result.apiKey.startsWith(API_KEY_PREFIX)).toBe(true);
      expect(result.prefix).toBeDefined();
      expect(result.prefix.startsWith(API_KEY_PREFIX)).toBe(true);
      expect(result.prefix.length).toBe(API_KEY_PREFIX.length + 8);
    });

    test("should create an API key with expiration", async () => {
      const expiresAt = futureExpiry(30);

      const result = await owner.asUser.mutation(api.apiKey.createApiKey, {
        name: "Temporary Key",
        scopes: ["secrets.read"],
        expiresAt,
      });

      expect(result.apiKey).toBeDefined();

      const keys = await owner.asUser.query(api.apiKey.listApiKeys, {});
      const createdKey = keys.find((k) => k.prefix === result.prefix);
      expect(createdKey?.expiresAt).toBe(expiresAt);
    });

    test("should reject API key creation for free users", async () => {
      const freeUser = testUsers[2]!;

      await expectConvexError(
        () =>
          freeUser.asUser.mutation(api.apiKey.createApiKey, {
            name: "Should Fail",
            scopes: ["secrets.read"],
            expiresAt: futureExpiry(),
          }),
        ErrorCode.PRO_PLAN_REQUIRED,
      );
    });

    test("should reject empty name", async () => {
      await expectConvexError(
        () =>
          owner.asUser.mutation(api.apiKey.createApiKey, {
            name: "  ",
            scopes: ["secrets.read"],
            expiresAt: futureExpiry(),
          }),
        ErrorCode.INVALID_ARGUMENTS,
      );
    });

    test("should reject invalid scopes", async () => {
      await expectConvexError(
        () =>
          owner.asUser.mutation(api.apiKey.createApiKey, {
            name: "Bad Scopes",
            scopes: ["invalid.scope"],
            expiresAt: futureExpiry(),
          }),
        ErrorCode.INVALID_ARGUMENTS,
      );
    });

    test("should reject empty scopes", async () => {
      await expectConvexError(
        () =>
          owner.asUser.mutation(api.apiKey.createApiKey, {
            name: "No Scopes",
            scopes: [],
            expiresAt: futureExpiry(),
          }),
        ErrorCode.INVALID_ARGUMENTS,
      );
    });

    test("should enforce max 5 active keys per user", async () => {
      for (let i = 0; i < 5; i++) {
        await owner.asUser.mutation(api.apiKey.createApiKey, {
          name: `Key ${i}`,
          scopes: ["secrets.read"],
          expiresAt: futureExpiry(),
        });
      }

      await expectConvexError(
        () =>
          owner.asUser.mutation(api.apiKey.createApiKey, {
            name: "Key 6",
            scopes: ["secrets.read"],
            expiresAt: futureExpiry(),
          }),
        ErrorCode.RATE_LIMIT_EXCEEDED,
      );
    });

    test("should allow creating new key after revoking one", async () => {
      for (let i = 0; i < 5; i++) {
        await owner.asUser.mutation(api.apiKey.createApiKey, {
          name: `Key ${i}`,
          scopes: ["secrets.read"],
          expiresAt: futureExpiry(),
        });
      }

      const keys = await owner.asUser.query(api.apiKey.listApiKeys, {});
      await owner.asUser.mutation(api.apiKey.revokeApiKey, {
        apiKeyId: keys[0].id,
      });

      const result = await owner.asUser.mutation(api.apiKey.createApiKey, {
        name: "Replacement Key",
        scopes: ["secrets.read"],
        expiresAt: futureExpiry(),
      });

      expect(result.apiKey).toBeDefined();
    });

    test("should reject expiration in the past", async () => {
      await expectConvexError(
        () =>
          owner.asUser.mutation(api.apiKey.createApiKey, {
            name: "Past Expiry",
            scopes: ["secrets.read"],
            expiresAt: Date.now() - 1000,
          }),
        ErrorCode.INVALID_ARGUMENTS,
        "Expiration must be in the future",
      );
    });

    test("should reject expiration beyond 365 days", async () => {
      await expectConvexError(
        () =>
          owner.asUser.mutation(api.apiKey.createApiKey, {
            name: "Too Far",
            scopes: ["secrets.read"],
            expiresAt: futureExpiry(400),
          }),
        ErrorCode.INVALID_ARGUMENTS,
        "Expiration cannot exceed 365 days",
      );
    });

    test("should accept expiration at exactly 365 days", async () => {
      const result = await owner.asUser.mutation(api.apiKey.createApiKey, {
        name: "Max Expiry",
        scopes: ["secrets.read"],
        expiresAt: futureExpiry(365),
      });

      expect(result.apiKey).toBeDefined();
    });
  });

  describe("Project-Scoped API Keys", () => {
    let projectId: Id<"project">;

    beforeEach(async () => {
      mockAutumn.setFeature(owner.userId, "projects", 2);
      const { encryptedProjectKey } = await createProjectKey(owner.publicKey!);
      const result = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project_" + randomString(),
      });
      projectId = assertProjectCreated(result);
    });

    test("should create a project-scoped API key", async () => {
      const result = await owner.asUser.mutation(api.apiKey.createApiKey, {
        name: "Scoped Key",
        scopes: ["secrets.read"],
        expiresAt: futureExpiry(),
        projectId,
      });

      expect(result.apiKey).toBeDefined();

      const keys = await owner.asUser.query(api.apiKey.listApiKeys, {});
      const scopedKey = keys.find((k) => k.prefix === result.prefix);
      expect(scopedKey?.projectId).toBe(projectId);
    });

    test("should list project-scoped keys with projectId", async () => {
      await owner.asUser.mutation(api.apiKey.createApiKey, {
        name: "Scoped Key",
        scopes: ["secrets.read"],
        expiresAt: futureExpiry(),
        projectId,
      });

      await owner.asUser.mutation(api.apiKey.createApiKey, {
        name: "Unscoped Key",
        scopes: ["secrets.read"],
        expiresAt: futureExpiry(),
      });

      const keys = await owner.asUser.query(api.apiKey.listApiKeys, {});
      const scoped = keys.find((k) => k.name === "Scoped Key");
      const unscoped = keys.find((k) => k.name === "Unscoped Key");

      expect(scoped?.projectId).toBe(projectId);
      expect(unscoped?.projectId).toBeUndefined();
    });

    test("should reject scoping to another user's project without share", async () => {
      mockAutumn.setFeature(otherUser.userId, "projects", 2);
      const { encryptedProjectKey } = await createProjectKey(otherUser.publicKey!);
      const otherResult = await otherUser.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "other_project_" + randomString(),
      });
      const otherProjectId = assertProjectCreated(otherResult);

      await expectConvexError(
        () =>
          owner.asUser.mutation(api.apiKey.createApiKey, {
            name: "Not My Project",
            scopes: ["secrets.read"],
            expiresAt: futureExpiry(),
            projectId: otherProjectId,
          }),
        ErrorCode.REQUEST_NOT_FOUND,
      );
    });

    test("collaborator should create a scoped key for a shared project", async () => {
      mockAutumn.setBooleanFeature(owner.userId, "can_share_project", true);
      mockAutumn.setFeature(owner.userId, "additional_shares", 5);

      const { wrapAESKeyWithRSA, importPublicKey, unwrapProjectKey } = await import("@repo/crypto");
      const { encryptedProjectKey: ownerEPK } = await createProjectKey(owner.publicKey!);

      const sharedProjectResult = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey: ownerEPK,
        name: "shared_project_" + randomString(),
      });
      const sharedProjectId = assertProjectCreated(sharedProjectResult);

      const projectKey = await unwrapProjectKey(
        ownerEPK,
        owner.encryptedPrivateKey!,
        owner.password!,
        owner.salt!,
      );
      const collabPublicKey = await importPublicKey(otherUser.publicKey!);
      const collabEncryptedProjectKey = await wrapAESKeyWithRSA(projectKey, collabPublicKey);

      await owner.asUser.action(api.projectShare.shareProject, {
        projectId: sharedProjectId,
        userEmail: otherUser.email,
        encryptedProjectKey: collabEncryptedProjectKey,
      });

      const result = await otherUser.asUser.mutation(api.apiKey.createApiKey, {
        name: "Collaborator Scoped Key",
        scopes: ["secrets.read"],
        expiresAt: futureExpiry(),
        projectId: sharedProjectId,
      });

      expect(result.apiKey).toBeDefined();

      const keys = await otherUser.asUser.query(api.apiKey.listApiKeys, {});
      const scopedKey = keys.find((k) => k.prefix === result.prefix);
      expect(scopedKey?.projectId).toBe(sharedProjectId);
    });

    test("collaborator scoped key should be rejected after share is revoked", async () => {
      mockAutumn.setBooleanFeature(owner.userId, "can_share_project", true);
      mockAutumn.setFeature(owner.userId, "additional_shares", 5);

      const { wrapAESKeyWithRSA, importPublicKey, unwrapProjectKey } = await import("@repo/crypto");
      const { encryptedProjectKey: ownerEPK } = await createProjectKey(owner.publicKey!);

      const sharedProjectResult = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey: ownerEPK,
        name: "shared_revoke_" + randomString(),
      });
      const sharedProjectId = assertProjectCreated(sharedProjectResult);

      await owner.asUser.mutation(api.environment.createEnvironment, {
        name: "production",
        projectId: sharedProjectId,
      });

      const projectKey = await unwrapProjectKey(
        ownerEPK,
        owner.encryptedPrivateKey!,
        owner.password!,
        owner.salt!,
      );
      const collabPublicKey = await importPublicKey(otherUser.publicKey!);
      const collabEncryptedProjectKey = await wrapAESKeyWithRSA(projectKey, collabPublicKey);

      await owner.asUser.action(api.projectShare.shareProject, {
        projectId: sharedProjectId,
        userEmail: otherUser.email,
        encryptedProjectKey: collabEncryptedProjectKey,
      });

      const { apiKey } = await otherUser.asUser.mutation(api.apiKey.createApiKey, {
        name: "Collab Key Before Revoke",
        scopes: ["secrets.read"],
        expiresAt: futureExpiry(),
        projectId: sharedProjectId,
      });

      const shares = await owner.asUser.query(api.projectShare.listActiveProjectSharesByProject, {
        projectId: sharedProjectId,
      });
      const activeShare = shares.shares[0];

      await owner.asUser.action(api.projectShare.revokeShare, {
        shareId: activeShare!.id,
      });

      const response = await t.fetch("/api/secrets/export", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ projectId: sharedProjectId, environmentName: "production" }),
      });

      expect(response.status).toBe(403);
    });

    test("project-scoped key should export secrets for its project", async () => {
      const { id: environmentId } = await owner.asUser.mutation(api.environment.createEnvironment, {
        name: "production",
        projectId,
      });

      await owner.asUser.mutation(api.secret.createSecret, {
        encryptedValue: "value",
        environmentId,
        key: "SECRET_1",
        valueType: "string",
        folderId: undefined,
      });

      const { apiKey } = await owner.asUser.mutation(api.apiKey.createApiKey, {
        name: "Scoped CI Key",
        scopes: ["secrets.read"],
        expiresAt: futureExpiry(),
        projectId,
      });

      const response = await t.fetch("/api/secrets/export", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ projectId, environmentName: "production" }),
      });

      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.count).toBe(1);
    });

    test("project-scoped key should be rejected for a different project", async () => {
      const { encryptedProjectKey: ePK2 } = await createProjectKey(owner.publicKey!);
      const result2 = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey: ePK2,
        name: "other_" + randomString(),
      });
      const otherProjectId = assertProjectCreated(result2);

      await owner.asUser.mutation(api.environment.createEnvironment, {
        name: "production",
        projectId: otherProjectId,
      });

      const { apiKey } = await owner.asUser.mutation(api.apiKey.createApiKey, {
        name: "Scoped to First",
        scopes: ["secrets.read"],
        expiresAt: futureExpiry(),
        projectId,
      });

      const response = await t.fetch("/api/secrets/export", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ projectId: otherProjectId, environmentName: "production" }),
      });

      expect(response.status).toBe(403);
    });

    test("unscoped key should still access any owned project", async () => {
      const { id: environmentId } = await owner.asUser.mutation(api.environment.createEnvironment, {
        name: "production",
        projectId,
      });

      await owner.asUser.mutation(api.secret.createSecret, {
        encryptedValue: "value",
        environmentId,
        key: "KEY",
        valueType: "string",
        folderId: undefined,
      });

      const { apiKey } = await owner.asUser.mutation(api.apiKey.createApiKey, {
        name: "Unscoped Key",
        scopes: ["secrets.read"],
        expiresAt: futureExpiry(),
      });

      const response = await t.fetch("/api/secrets/export", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ projectId, environmentName: "production" }),
      });

      expect(response.status).toBe(200);
    });
  });

  describe("List API Keys", () => {
    test("should list user's API keys without exposing hash", async () => {
      await owner.asUser.mutation(api.apiKey.createApiKey, {
        name: "Key A",
        scopes: ["secrets.read"],
        expiresAt: futureExpiry(),
      });

      await owner.asUser.mutation(api.apiKey.createApiKey, {
        name: "Key B",
        scopes: ["secrets.read"],
        expiresAt: futureExpiry(),
      });

      const keys = await owner.asUser.query(api.apiKey.listApiKeys, {});

      expect(keys).toHaveLength(2);
      expect(keys[0].name).toBe("Key A");
      expect(keys[1].name).toBe("Key B");
      expect(keys[0].prefix).toBeDefined();
      expect(keys[0].scopes).toEqual(["secrets.read"]);
      expect((keys[0] as Record<string, unknown>).hashedKey).toBeUndefined();
    });

    test("should not see other user's keys", async () => {
      await owner.asUser.mutation(api.apiKey.createApiKey, {
        name: "Owner Key",
        scopes: ["secrets.read"],
        expiresAt: futureExpiry(),
      });

      const otherKeys = await otherUser.asUser.query(api.apiKey.listApiKeys, {});
      expect(otherKeys).toHaveLength(0);
    });
  });

  describe("Revoke API Key", () => {
    test("should revoke an API key", async () => {
      const { prefix } = await owner.asUser.mutation(api.apiKey.createApiKey, {
        name: "To Revoke",
        scopes: ["secrets.read"],
        expiresAt: futureExpiry(),
      });

      const keysBefore = await owner.asUser.query(api.apiKey.listApiKeys, {});
      const key = keysBefore.find((k) => k.prefix === prefix)!;
      expect(key.revokedAt).toBeUndefined();

      await owner.asUser.mutation(api.apiKey.revokeApiKey, {
        apiKeyId: key.id,
      });

      const keysAfter = await owner.asUser.query(api.apiKey.listApiKeys, {});
      const revokedKey = keysAfter.find((k) => k.prefix === prefix)!;
      expect(revokedKey.revokedAt).toBeDefined();
    });

    test("should not revoke another user's key", async () => {
      await owner.asUser.mutation(api.apiKey.createApiKey, {
        name: "Owner Key",
        scopes: ["secrets.read"],
        expiresAt: futureExpiry(),
      });

      const ownerKeys = await owner.asUser.query(api.apiKey.listApiKeys, {});

      await expectConvexError(
        () =>
          otherUser.asUser.mutation(api.apiKey.revokeApiKey, {
            apiKeyId: ownerKeys[0].id,
          }),
        ErrorCode.REQUEST_NOT_FOUND,
      );
    });

    test("should not revoke an already revoked key", async () => {
      await owner.asUser.mutation(api.apiKey.createApiKey, {
        name: "Double Revoke",
        scopes: ["secrets.read"],
        expiresAt: futureExpiry(),
      });

      const keys = await owner.asUser.query(api.apiKey.listApiKeys, {});

      await owner.asUser.mutation(api.apiKey.revokeApiKey, {
        apiKeyId: keys[0].id,
      });

      await expectConvexError(
        () =>
          owner.asUser.mutation(api.apiKey.revokeApiKey, {
            apiKeyId: keys[0].id,
          }),
        ErrorCode.INVALID_OPERATION,
      );
    });
  });

  describe("Export Secrets with API Key (HTTP)", () => {
    beforeEach(async () => {
      mockAutumn.setFeature(owner.userId, "projects", 2);
    });

    async function exportViaHttp(apiKey: string, body: Record<string, unknown>): Promise<Response> {
      return await t.fetch("/api/secrets/export", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
    }

    test("should export secrets using a valid API key", async () => {
      const { encryptedProjectKey } = await createProjectKey(owner.publicKey!);

      const projectResult = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project_" + randomString(),
      });
      const projectId = assertProjectCreated(projectResult);

      const { id: environmentId } = await owner.asUser.mutation(api.environment.createEnvironment, {
        name: "production",
        projectId,
      });

      for (let i = 0; i < 3; i++) {
        await owner.asUser.mutation(api.secret.createSecret, {
          encryptedValue: "encrypted-value-" + i,
          environmentId,
          key: "SECRET_" + i,
          valueType: "string",
          folderId: undefined,
        });
      }

      const { apiKey } = await owner.asUser.mutation(api.apiKey.createApiKey, {
        name: "CI Key",
        scopes: ["secrets.read"],
        expiresAt: futureExpiry(),
      });

      const response = await exportViaHttp(apiKey, {
        projectId,
        environmentName: "production",
      });

      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.count).toBe(3);
      expect(result.secrets).toHaveLength(3);
      expect(result.encryptedProjectKey).toBeDefined();
    });

    test("should reject missing Authorization header", async () => {
      const response = await t.fetch("/api/secrets/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: "fake" }),
      });

      expect(response.status).toBe(401);
    });

    test("should reject an invalid API key", async () => {
      const { encryptedProjectKey } = await createProjectKey(owner.publicKey!);

      const projectResult = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project_" + randomString(),
      });
      const projectId = assertProjectCreated(projectResult);

      const response = await exportViaHttp("relic_sk_invalidkey", {
        projectId,
        environmentName: "production",
      });

      expect(response.status).toBe(401);
    });

    test("should reject a revoked API key", async () => {
      const { encryptedProjectKey } = await createProjectKey(owner.publicKey!);

      const projectResult = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project_" + randomString(),
      });
      const projectId = assertProjectCreated(projectResult);

      await owner.asUser.mutation(api.environment.createEnvironment, {
        name: "production",
        projectId,
      });

      const { apiKey } = await owner.asUser.mutation(api.apiKey.createApiKey, {
        name: "Revocable Key",
        scopes: ["secrets.read"],
        expiresAt: futureExpiry(),
      });

      const keys = await owner.asUser.query(api.apiKey.listApiKeys, {});
      await owner.asUser.mutation(api.apiKey.revokeApiKey, {
        apiKeyId: keys[0].id,
      });

      const response = await exportViaHttp(apiKey, {
        projectId,
        environmentName: "production",
      });

      expect(response.status).toBe(401);
    });

    test("should reject an expired API key", async () => {
      const { encryptedProjectKey } = await createProjectKey(owner.publicKey!);

      const projectResult = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project_" + randomString(),
      });
      const projectId = assertProjectCreated(projectResult);

      await owner.asUser.mutation(api.environment.createEnvironment, {
        name: "production",
        projectId,
      });

      const { apiKey } = await owner.asUser.mutation(api.apiKey.createApiKey, {
        name: "Expired Key",
        scopes: ["secrets.read"],
        expiresAt: Date.now() + 1,
      });

      await new Promise((r) => setTimeout(r, 10));

      const response = await exportViaHttp(apiKey, {
        projectId,
        environmentName: "production",
      });

      expect(response.status).toBe(401);
    });

    test("should update lastUsedAt on successful use", async () => {
      const { encryptedProjectKey } = await createProjectKey(owner.publicKey!);

      const projectResult = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project_" + randomString(),
      });
      const projectId = assertProjectCreated(projectResult);

      const { id: environmentId } = await owner.asUser.mutation(api.environment.createEnvironment, {
        name: "production",
        projectId,
      });

      await owner.asUser.mutation(api.secret.createSecret, {
        encryptedValue: "value",
        environmentId,
        key: "KEY",
        valueType: "string",
        folderId: undefined,
      });

      const { apiKey } = await owner.asUser.mutation(api.apiKey.createApiKey, {
        name: "Usage Tracker",
        scopes: ["secrets.read"],
        expiresAt: futureExpiry(),
      });

      const keysBefore = await owner.asUser.query(api.apiKey.listApiKeys, {});
      expect(keysBefore[0].lastUsedAt).toBeUndefined();

      const response = await exportViaHttp(apiKey, {
        projectId,
        environmentName: "production",
      });

      expect(response.status).toBe(200);

      const keysAfter = await owner.asUser.query(api.apiKey.listApiKeys, {});
      expect(keysAfter[0].lastUsedAt).toBeDefined();
    });

    test("should reject API key usage after downgrade to free plan", async () => {
      const { encryptedProjectKey } = await createProjectKey(owner.publicKey!);

      const projectResult = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project_" + randomString(),
      });
      const projectId = assertProjectCreated(projectResult);

      const { id: environmentId } = await owner.asUser.mutation(api.environment.createEnvironment, {
        name: "production",
        projectId,
      });

      await owner.asUser.mutation(api.secret.createSecret, {
        encryptedValue: "value",
        environmentId,
        key: "KEY",
        valueType: "string",
        folderId: undefined,
      });

      const { apiKey } = await owner.asUser.mutation(api.apiKey.createApiKey, {
        name: "Pre-downgrade Key",
        scopes: ["secrets.read"],
        expiresAt: futureExpiry(),
      });

      await owner.asUser.mutation(components.betterAuth.user.downgradeToFree, {
        userId: owner.userId,
      });

      const response = await exportViaHttp(apiKey, {
        projectId,
        environmentName: "production",
      });

      expect(response.status).toBe(402);
      const result = await response.json();
      expect(result.code).toBe("PRO_PLAN_REQUIRED");
      expect(result.upgradeUrl).toBeDefined();
    });

    test("should not access another user's project with API key", async () => {
      mockAutumn.setFeature(otherUser.userId, "projects", 2);

      const { encryptedProjectKey } = await createProjectKey(otherUser.publicKey!);

      const projectResult = await otherUser.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "project_" + randomString(),
      });
      const projectId = assertProjectCreated(projectResult);

      await otherUser.asUser.mutation(api.environment.createEnvironment, {
        name: "production",
        projectId,
      });

      const { apiKey } = await owner.asUser.mutation(api.apiKey.createApiKey, {
        name: "Unauthorized Key",
        scopes: ["secrets.read"],
        expiresAt: futureExpiry(),
      });

      const response = await exportViaHttp(apiKey, {
        projectId,
        environmentName: "production",
      });

      expect(response.status).toBe(403);
    });
  });

  describe("Get User Keys with API Key (HTTP)", () => {
    async function fetchKeysViaHttp(apiKey: string): Promise<Response> {
      return await t.fetch("/api/user/keys", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });
    }

    test("should return user crypto keys with valid API key", async () => {
      const { apiKey } = await owner.asUser.mutation(api.apiKey.createApiKey, {
        name: "Keys Reader",
        scopes: ["user.keys.read"],
        expiresAt: futureExpiry(),
      });

      const response = await fetchKeysViaHttp(apiKey);

      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.encryptedPrivateKey).toBeDefined();
      expect(result.salt).toBeDefined();
      expect(result.publicKey).toBeDefined();
    });

    test("should reject user keys request after downgrade to free plan", async () => {
      const { apiKey } = await owner.asUser.mutation(api.apiKey.createApiKey, {
        name: "Pre-downgrade Keys Reader",
        scopes: ["user.keys.read"],
        expiresAt: futureExpiry(),
      });

      await owner.asUser.mutation(components.betterAuth.user.downgradeToFree, {
        userId: owner.userId,
      });

      const response = await fetchKeysViaHttp(apiKey);

      expect(response.status).toBe(402);
      const result = await response.json();
      expect(result.code).toBe("PRO_PLAN_REQUIRED");
      expect(result.upgradeUrl).toBeDefined();
    });

    test("should reject API key without user.keys.read scope", async () => {
      const { apiKey } = await owner.asUser.mutation(api.apiKey.createApiKey, {
        name: "Secrets Only",
        scopes: ["secrets.read"],
        expiresAt: futureExpiry(),
      });

      const response = await fetchKeysViaHttp(apiKey);

      expect(response.status).toBe(403);
    });

    test("should reject missing Authorization header", async () => {
      const response = await t.fetch("/api/user/keys", {
        method: "GET",
      });

      expect(response.status).toBe(401);
    });

    test("should reject invalid API key", async () => {
      const response = await fetchKeysViaHttp("relic_sk_invalidkey");

      expect(response.status).toBe(401);
    });
  });
});
