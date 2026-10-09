import {
  createProjectKey,
  importPublicKey,
  unwrapProjectKey,
  wrapAESKeyWithRSA,
} from "@repo/crypto";
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { api, components } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { hashKey } from "../convex/lib/crypto";
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

async function buildServiceAccountArgs(owner: TestUser, encryptedProjectKey: string) {
  const { generateRSAKeyPair, exportPublicKey, encryptPrivateKeyWithPassword, generateSalt } =
    await import("@repo/crypto");

  const saKeyPair = await generateRSAKeyPair();
  const saPublicKeyStr = await exportPublicKey(saKeyPair.publicKey);
  const saSalt = generateSalt();
  const saEncryptedPrivateKey = await encryptPrivateKeyWithPassword(
    saKeyPair.privateKey,
    "sa-token-" + randomString(32),
    saSalt,
  );

  const projectKey = await unwrapProjectKey(
    encryptedProjectKey,
    owner.encryptedPrivateKey!,
    owner.password!,
    owner.salt!,
  );
  const saEncryptedProjectKey = await wrapAESKeyWithRSA(
    projectKey,
    await importPublicKey(saPublicKeyStr),
  );

  const rawToken = "rsk_" + randomString(48);

  return {
    rawToken,
    args: {
      publicKey: saPublicKeyStr,
      encryptedPrivateKey: saEncryptedPrivateKey,
      salt: saSalt,
      encryptedProjectKey: saEncryptedProjectKey,
      hashedToken: await hashKey(rawToken),
      tokenPrefix: rawToken.slice(0, 12),
    },
  };
}

describe("Secret Names", () => {
  let t: TestConvex<typeof schema>;
  let testUsers: TestUser[] = [];
  let owner: TestUser;
  let collaborator: TestUser;
  let outsider: TestUser;
  let projectId: Id<"project">;
  let encryptedProjectKey: string;

  beforeEach(async () => {
    t = convexTest(schema, modules);

    const betterAuthSchema = await import("../convex/betterAuth/generatedSchema.ts");
    t.registerComponent("betterAuth", betterAuthSchema.default, betterAuthModules);

    testUsers = await getTestUsers(t);
    owner = testUsers[0]!;
    collaborator = testUsers[1]!;
    outsider = testUsers[2]!;

    await owner.asUser.mutation(components.betterAuth.user.upgradeToPro, {
      userId: owner.userId,
    });

    mockAutumn.setFeature(owner.userId, "projects", 5);
    ({ encryptedProjectKey } = await createProjectKey(owner.publicKey!));
    const result = await owner.asUser.action(api.project.createProject, {
      encryptedProjectKey,
      name: "names_test_" + randomString(),
    });
    projectId = assertProjectCreated(result);

    const { id: environmentId } = await owner.asUser.mutation(api.environment.createEnvironment, {
      name: "production",
      projectId,
    });
    const { id: folderId } = await owner.asUser.mutation(api.folder.createFolder, {
      environmentId,
      name: "api",
    });

    await owner.asUser.mutation(api.secret.createSecret, {
      environmentId,
      key: "DATABASE_URL",
      encryptedValue: "ciphertext-db",
      valueType: "string",
      scope: "server",
    });
    await owner.asUser.mutation(api.secret.createSecret, {
      environmentId,
      key: "NEXT_PUBLIC_SITE_URL",
      encryptedValue: "ciphertext-site",
      valueType: "string",
      scope: "client",
    });
    await owner.asUser.mutation(api.secret.createSecret, {
      environmentId,
      folderId,
      key: "API_TOKEN",
      encryptedValue: "ciphertext-token",
      valueType: "string",
    });
  });

  afterEach(() => {
    mockAutumn.reset();
  });

  async function shareWithCollaborator() {
    mockAutumn.setBooleanFeature(owner.userId, "can_share_project", true);
    mockAutumn.setFeature(owner.userId, "additional_shares", 5);

    const projectKey = await unwrapProjectKey(
      encryptedProjectKey,
      owner.encryptedPrivateKey!,
      owner.password!,
      owner.salt!,
    );
    const collabPublicKey = await importPublicKey(collaborator.publicKey!);

    await owner.asUser.action(api.projectShare.shareProject, {
      projectId,
      userEmail: collaborator.email,
      encryptedProjectKey: await wrapAESKeyWithRSA(projectKey, collabPublicKey),
    });
  }

  describe("listSecretNames", () => {
    test("returns root-level names without values", async () => {
      const result = await owner.asUser.query(api.secret.listSecretNames, {
        projectId,
        environmentName: "production",
      });

      expect(result.count).toBe(2);
      expect(result.folderId).toBeNull();
      expect(result.secrets.map((s) => s.key).sort()).toEqual([
        "DATABASE_URL",
        "NEXT_PUBLIC_SITE_URL",
      ]);
      for (const secret of result.secrets) {
        expect(Object.keys(secret).sort()).toEqual(["key", "scope", "valueType"]);
      }
      expect(JSON.stringify(result)).not.toContain("ciphertext");
    });

    test("returns only names inside the requested folder", async () => {
      const result = await owner.asUser.query(api.secret.listSecretNames, {
        projectId,
        environmentName: "production",
        folderName: "api",
      });

      expect(result.folderId).not.toBeNull();
      expect(result.secrets.map((s) => s.key)).toEqual(["API_TOKEN"]);
    });

    test("filters by scope", async () => {
      const result = await owner.asUser.query(api.secret.listSecretNames, {
        projectId,
        environmentName: "production",
        scope: "client",
      });

      expect(result.secrets.map((s) => s.key)).toEqual(["NEXT_PUBLIC_SITE_URL"]);
    });

    test("allows a collaborator with an active share", async () => {
      await shareWithCollaborator();

      const result = await collaborator.asUser.query(api.secret.listSecretNames, {
        projectId,
        environmentName: "production",
      });

      expect(result.count).toBe(2);
    });

    test("rejects users without project access", async () => {
      await expectConvexError(
        () =>
          outsider.asUser.query(api.secret.listSecretNames, {
            projectId,
            environmentName: "production",
          }),
        ErrorCode.INSUFFICIENT_PERMISSION,
      );
    });

    test("rejects unknown environments", async () => {
      await expectConvexError(
        () =>
          owner.asUser.query(api.secret.listSecretNames, {
            projectId,
            environmentName: "staging",
          }),
        ErrorCode.ENVIRONMENT_NOT_FOUND,
      );
    });

    test("rejects unknown folders", async () => {
      await expectConvexError(
        () =>
          owner.asUser.query(api.secret.listSecretNames, {
            projectId,
            environmentName: "production",
            folderName: "missing",
          }),
        ErrorCode.FOLDER_NOT_FOUND,
      );
    });

    test("rejects unauthenticated callers", async () => {
      await expectConvexError(
        () =>
          t.query(api.secret.listSecretNames, {
            projectId,
            environmentName: "production",
          }),
        ErrorCode.UNAUTHORIZED,
      );
    });
  });

  describe("List secret names with API key (HTTP)", () => {
    async function namesViaHttp(apiKey: string, body: Record<string, unknown>) {
      return await t.fetch("/api/secrets/names", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
    }

    async function createKey(user: TestUser, keyProjectId?: Id<"project">) {
      const { apiKey } = await user.asUser.mutation(api.apiKey.createApiKey, {
        name: "Check Key",
        scopes: ["secrets.read"],
        expiresAt: futureExpiry(),
        projectId: keyProjectId,
      });
      return apiKey;
    }

    test("returns names without values", async () => {
      const apiKey = await createKey(owner);

      const response = await namesViaHttp(apiKey, { projectId, environmentName: "production" });

      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).not.toContain("ciphertext");
      expect(text).not.toContain("encryptedProjectKey");
      const result = JSON.parse(text);
      expect(result.count).toBe(2);
    });

    test("requires an environment name", async () => {
      const apiKey = await createKey(owner);

      const response = await namesViaHttp(apiKey, { projectId });

      expect(response.status).toBe(400);
    });

    test("rejects a missing Authorization header", async () => {
      const response = await t.fetch("/api/secrets/names", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, environmentName: "production" }),
      });

      expect(response.status).toBe(401);
    });

    test("rejects keys from users without project access", async () => {
      await outsider.asUser.mutation(components.betterAuth.user.upgradeToPro, {
        userId: outsider.userId,
      });
      const apiKey = await createKey(outsider);

      const response = await namesViaHttp(apiKey, { projectId, environmentName: "production" });

      expect(response.status).toBe(403);
    });

    test("rejects keys scoped to a different project", async () => {
      const other = await owner.asUser.action(api.project.createProject, {
        encryptedProjectKey,
        name: "names_other_" + randomString(),
      });
      const apiKey = await createKey(owner, assertProjectCreated(other));

      const response = await namesViaHttp(apiKey, { projectId, environmentName: "production" });

      expect(response.status).toBe(403);
    });
  });

  describe("List secret names with service token (HTTP)", () => {
    async function namesViaServiceToken(
      token: string,
      body: Record<string, unknown>,
      headers: Record<string, string> = {},
    ) {
      return await t.fetch("/api/sa/secrets/names", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          ...headers,
        },
        body: JSON.stringify(body),
      });
    }

    async function createServiceAccount(extra: Record<string, string> = {}) {
      const { rawToken, args } = await buildServiceAccountArgs(owner, encryptedProjectKey);
      const result = await owner.asUser.mutation(api.serviceAccount.createServiceAccount, {
        projectId,
        name: "check-" + randomString(),
        ...args,
        ...extra,
      });
      return { rawToken, serviceAccountId: result.id };
    }

    test("returns names for the token's project without values or keys", async () => {
      const { rawToken } = await createServiceAccount();

      const response = await namesViaServiceToken(rawToken, {
        environmentName: "production",
        folderName: "api",
      });

      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).not.toContain("ciphertext");
      expect(text).not.toContain("encryptedPrivateKey");
      expect(text).not.toContain("encryptedProjectKey");
      const result = JSON.parse(text);
      expect(result.secrets.map((s: { key: string }) => s.key)).toEqual(["API_TOKEN"]);
    });

    test("requires an environment name", async () => {
      const { rawToken } = await createServiceAccount();

      const response = await namesViaServiceToken(rawToken, {});

      expect(response.status).toBe(400);
    });

    test("rejects an invalid token", async () => {
      const response = await namesViaServiceToken("rsk_invalid", {
        environmentName: "production",
      });

      expect(response.status).toBe(401);
    });

    test("rejects a revoked token", async () => {
      const { rawToken, serviceAccountId } = await createServiceAccount();
      await owner.asUser.mutation(api.serviceAccount.revokeServiceAccount, {
        serviceAccountId: serviceAccountId as Id<"serviceAccount">,
      });

      const response = await namesViaServiceToken(rawToken, { environmentName: "production" });

      expect(response.status).toBe(401);
    });

    test("enforces the OIDC policy", async () => {
      const { rawToken } = await createServiceAccount({
        oidcIssuer: "https://token.actions.githubusercontent.com",
        oidcSubjectPattern: "repo:org/repo:*",
      });

      const response = await namesViaServiceToken(rawToken, { environmentName: "production" });

      expect(response.status).toBe(401);
      const result = await response.json();
      expect(result.code).toBe("OIDC_TOKEN_REQUIRED");
    });
  });
});
