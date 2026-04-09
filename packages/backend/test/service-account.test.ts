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

async function buildServiceAccountArgs(
  ownerPublicKey: string,
  ownerEncryptedPrivateKey: string,
  ownerPassword: string,
  ownerSalt: string,
  encryptedProjectKey: string,
) {
  const { generateRSAKeyPair, exportPublicKey, encryptPrivateKeyWithPassword, generateSalt } =
    await import("@repo/crypto");

  const saKeyPair = await generateRSAKeyPair();
  const saPublicKeyStr = await exportPublicKey(saKeyPair.publicKey);
  const saSalt = generateSalt();
  const saPassword = "sa-token-" + randomString(32);
  const saEncryptedPrivateKey = await encryptPrivateKeyWithPassword(
    saKeyPair.privateKey,
    saPassword,
    saSalt,
  );

  const projectKey = await unwrapProjectKey(
    encryptedProjectKey,
    ownerEncryptedPrivateKey,
    ownerPassword,
    ownerSalt,
  );
  const saPublicKey = await importPublicKey(saPublicKeyStr);
  const saEncryptedProjectKey = await wrapAESKeyWithRSA(projectKey, saPublicKey);

  const rawToken = "rsk_" + randomString(48);
  const hashedToken = await hashKey(rawToken);
  const tokenPrefix = rawToken.slice(0, 12);

  return {
    publicKey: saPublicKeyStr,
    encryptedPrivateKey: saEncryptedPrivateKey,
    salt: saSalt,
    encryptedProjectKey: saEncryptedProjectKey,
    hashedToken,
    tokenPrefix,
    rawToken,
  };
}

describe("Service Account Management", () => {
  let t: TestConvex<typeof schema>;
  let testUsers: TestUser[] = [];
  let owner: TestUser;
  let collaborator: TestUser;
  let freeUser: TestUser;
  let projectId: Id<"project">;
  let encryptedProjectKey: string;

  beforeEach(async () => {
    t = convexTest(schema, modules);

    const betterAuthSchema = await import("../convex/betterAuth/generatedSchema.ts");
    t.registerComponent("betterAuth", betterAuthSchema.default, betterAuthModules);

    testUsers = await getTestUsers(t);
    owner = testUsers[0]!;
    collaborator = testUsers[1]!;
    freeUser = testUsers[2]!;

    await owner.asUser.mutation(components.betterAuth.user.upgradeToPro, {
      userId: owner.userId,
    });
    await collaborator.asUser.mutation(components.betterAuth.user.upgradeToPro, {
      userId: collaborator.userId,
    });

    mockAutumn.setFeature(owner.userId, "projects", 5);
    const projectKeyResult = await createProjectKey(owner.publicKey!);
    encryptedProjectKey = projectKeyResult.encryptedProjectKey;
    const result = await owner.asUser.action(api.project.createProject, {
      encryptedProjectKey,
      name: "sa_test_" + randomString(),
    });
    projectId = assertProjectCreated(result);
  });

  afterEach(() => {
    mockAutumn.reset();
  });

  describe("createServiceAccount", () => {
    test("should create a service account", async () => {
      const { rawToken, ...saArgs } = await buildServiceAccountArgs(
        owner.publicKey!,
        owner.encryptedPrivateKey!,
        owner.password!,
        owner.salt!,
        encryptedProjectKey,
      );

      const result = await owner.asUser.mutation(api.serviceAccount.createServiceAccount, {
        projectId,
        name: "CI Deploy",
        ...saArgs,
        expiresAt: futureExpiry(90),
      });

      expect(result.id).toBeDefined();
      expect(result.tokenPrefix).toBe(saArgs.tokenPrefix);
    });

    test("should reject for free users", async () => {
      const { rawToken, ...saArgs } = await buildServiceAccountArgs(
        owner.publicKey!,
        owner.encryptedPrivateKey!,
        owner.password!,
        owner.salt!,
        encryptedProjectKey,
      );

      await expectConvexError(
        () =>
          freeUser.asUser.mutation(api.serviceAccount.createServiceAccount, {
            projectId,
            name: "Should Fail",
            ...saArgs,
          }),
        ErrorCode.PRO_PLAN_REQUIRED,
      );
    });

    test("should reject for non-owner", async () => {
      mockAutumn.setBooleanFeature(owner.userId, "can_share_project", true);
      mockAutumn.setFeature(owner.userId, "additional_shares", 5);

      const projectKey = await unwrapProjectKey(
        encryptedProjectKey,
        owner.encryptedPrivateKey!,
        owner.password!,
        owner.salt!,
      );
      const collabPublicKey = await importPublicKey(collaborator.publicKey!);
      const collabEncryptedProjectKey = await wrapAESKeyWithRSA(projectKey, collabPublicKey);

      await owner.asUser.action(api.projectShare.shareProject, {
        projectId,
        userEmail: collaborator.email,
        encryptedProjectKey: collabEncryptedProjectKey,
      });

      const { rawToken, ...saArgs } = await buildServiceAccountArgs(
        collaborator.publicKey!,
        collaborator.encryptedPrivateKey!,
        collaborator.password!,
        collaborator.salt!,
        collabEncryptedProjectKey,
      );

      await expectConvexError(
        () =>
          collaborator.asUser.mutation(api.serviceAccount.createServiceAccount, {
            projectId,
            name: "Collab SA",
            ...saArgs,
          }),
        ErrorCode.INSUFFICIENT_PERMISSION,
      );
    });

    test("should reject empty name", async () => {
      const { rawToken, ...saArgs } = await buildServiceAccountArgs(
        owner.publicKey!,
        owner.encryptedPrivateKey!,
        owner.password!,
        owner.salt!,
        encryptedProjectKey,
      );

      await expectConvexError(
        () =>
          owner.asUser.mutation(api.serviceAccount.createServiceAccount, {
            projectId,
            name: "  ",
            ...saArgs,
          }),
        ErrorCode.INVALID_ARGUMENTS,
      );
    });

    test("should reject expiration in the past", async () => {
      const { rawToken, ...saArgs } = await buildServiceAccountArgs(
        owner.publicKey!,
        owner.encryptedPrivateKey!,
        owner.password!,
        owner.salt!,
        encryptedProjectKey,
      );

      await expectConvexError(
        () =>
          owner.asUser.mutation(api.serviceAccount.createServiceAccount, {
            projectId,
            name: "Past Expiry",
            expiresAt: Date.now() - 1000,
            ...saArgs,
          }),
        ErrorCode.INVALID_ARGUMENTS,
        "Expiration must be in the future",
      );
    });

    test("should reject expiration beyond 365 days", async () => {
      const { rawToken, ...saArgs } = await buildServiceAccountArgs(
        owner.publicKey!,
        owner.encryptedPrivateKey!,
        owner.password!,
        owner.salt!,
        encryptedProjectKey,
      );

      await expectConvexError(
        () =>
          owner.asUser.mutation(api.serviceAccount.createServiceAccount, {
            projectId,
            name: "Far Expiry",
            expiresAt: futureExpiry(400),
            ...saArgs,
          }),
        ErrorCode.INVALID_ARGUMENTS,
        "Expiration cannot exceed 365 days",
      );
    });

    test("should enforce max 5 active service accounts per project", async () => {
      for (let i = 0; i < 5; i++) {
        const { rawToken, ...saArgs } = await buildServiceAccountArgs(
          owner.publicKey!,
          owner.encryptedPrivateKey!,
          owner.password!,
          owner.salt!,
          encryptedProjectKey,
        );
        await owner.asUser.mutation(api.serviceAccount.createServiceAccount, {
          projectId,
          name: `SA ${i}`,
          ...saArgs,
        });
      }

      const { rawToken, ...saArgs } = await buildServiceAccountArgs(
        owner.publicKey!,
        owner.encryptedPrivateKey!,
        owner.password!,
        owner.salt!,
        encryptedProjectKey,
      );

      await expectConvexError(
        () =>
          owner.asUser.mutation(api.serviceAccount.createServiceAccount, {
            projectId,
            name: "SA 6",
            ...saArgs,
          }),
        ErrorCode.RATE_LIMIT_EXCEEDED,
      );
    });

    test("should allow creating after revoking one at limit", async () => {
      for (let i = 0; i < 5; i++) {
        const { rawToken, ...saArgs } = await buildServiceAccountArgs(
          owner.publicKey!,
          owner.encryptedPrivateKey!,
          owner.password!,
          owner.salt!,
          encryptedProjectKey,
        );
        await owner.asUser.mutation(api.serviceAccount.createServiceAccount, {
          projectId,
          name: `SA ${i}`,
          ...saArgs,
        });
      }

      const accounts = await owner.asUser.query(api.serviceAccount.listServiceAccounts, {
        projectId,
      });
      await owner.asUser.mutation(api.serviceAccount.revokeServiceAccount, {
        serviceAccountId: accounts[0].id,
      });

      const { rawToken, ...saArgs } = await buildServiceAccountArgs(
        owner.publicKey!,
        owner.encryptedPrivateKey!,
        owner.password!,
        owner.salt!,
        encryptedProjectKey,
      );
      const result = await owner.asUser.mutation(api.serviceAccount.createServiceAccount, {
        projectId,
        name: "Replacement SA",
        ...saArgs,
      });

      expect(result.id).toBeDefined();
    });
  });

  describe("listServiceAccounts", () => {
    test("should list service accounts for owner", async () => {
      const { rawToken, ...saArgs } = await buildServiceAccountArgs(
        owner.publicKey!,
        owner.encryptedPrivateKey!,
        owner.password!,
        owner.salt!,
        encryptedProjectKey,
      );
      await owner.asUser.mutation(api.serviceAccount.createServiceAccount, {
        projectId,
        name: "Listed SA",
        ...saArgs,
      });

      const accounts = await owner.asUser.query(api.serviceAccount.listServiceAccounts, {
        projectId,
      });

      expect(accounts).toHaveLength(1);
      expect(accounts[0].name).toBe("Listed SA");
      expect(accounts[0].tokenPrefix).toBe(saArgs.tokenPrefix);
      expect(accounts[0].revokedAt).toBeUndefined();
      expect((accounts[0] as Record<string, unknown>).publicKey).toBeUndefined();
      expect((accounts[0] as Record<string, unknown>).encryptedPrivateKey).toBeUndefined();
      expect((accounts[0] as Record<string, unknown>).hashedToken).toBeUndefined();
    });

    test("should reject collaborator from listing service accounts", async () => {
      mockAutumn.setBooleanFeature(owner.userId, "can_share_project", true);
      mockAutumn.setFeature(owner.userId, "additional_shares", 5);

      const projectKey = await unwrapProjectKey(
        encryptedProjectKey,
        owner.encryptedPrivateKey!,
        owner.password!,
        owner.salt!,
      );
      const collabPublicKey = await importPublicKey(collaborator.publicKey!);
      const collabEncryptedProjectKey = await wrapAESKeyWithRSA(projectKey, collabPublicKey);

      await owner.asUser.action(api.projectShare.shareProject, {
        projectId,
        userEmail: collaborator.email,
        encryptedProjectKey: collabEncryptedProjectKey,
      });

      await expectConvexError(
        () =>
          collaborator.asUser.query(api.serviceAccount.listServiceAccounts, {
            projectId,
          }),
        ErrorCode.INSUFFICIENT_PERMISSION,
      );
    });

    test("should reject for user without project access", async () => {
      const outsider = testUsers[3]!;

      await expectConvexError(
        () =>
          outsider.asUser.query(api.serviceAccount.listServiceAccounts, {
            projectId,
          }),
        ErrorCode.INSUFFICIENT_PERMISSION,
      );
    });
  });

  describe("revokeServiceAccount", () => {
    test("should revoke a service account", async () => {
      const { rawToken, ...saArgs } = await buildServiceAccountArgs(
        owner.publicKey!,
        owner.encryptedPrivateKey!,
        owner.password!,
        owner.salt!,
        encryptedProjectKey,
      );
      await owner.asUser.mutation(api.serviceAccount.createServiceAccount, {
        projectId,
        name: "To Revoke",
        ...saArgs,
      });

      const before = await owner.asUser.query(api.serviceAccount.listServiceAccounts, {
        projectId,
      });
      expect(before[0].revokedAt).toBeUndefined();

      await owner.asUser.mutation(api.serviceAccount.revokeServiceAccount, {
        serviceAccountId: before[0].id,
      });

      const after = await owner.asUser.query(api.serviceAccount.listServiceAccounts, {
        projectId,
      });
      expect(after[0].revokedAt).toBeDefined();
    });

    test("should reject revoking by non-owner", async () => {
      mockAutumn.setBooleanFeature(owner.userId, "can_share_project", true);
      mockAutumn.setFeature(owner.userId, "additional_shares", 5);

      const projectKey = await unwrapProjectKey(
        encryptedProjectKey,
        owner.encryptedPrivateKey!,
        owner.password!,
        owner.salt!,
      );
      const collabPublicKey = await importPublicKey(collaborator.publicKey!);
      const collabEncryptedProjectKey = await wrapAESKeyWithRSA(projectKey, collabPublicKey);

      await owner.asUser.action(api.projectShare.shareProject, {
        projectId,
        userEmail: collaborator.email,
        encryptedProjectKey: collabEncryptedProjectKey,
      });

      const { rawToken, ...saArgs } = await buildServiceAccountArgs(
        owner.publicKey!,
        owner.encryptedPrivateKey!,
        owner.password!,
        owner.salt!,
        encryptedProjectKey,
      );
      await owner.asUser.mutation(api.serviceAccount.createServiceAccount, {
        projectId,
        name: "Owner Only Revoke",
        ...saArgs,
      });

      const accounts = await owner.asUser.query(api.serviceAccount.listServiceAccounts, {
        projectId,
      });

      await expectConvexError(
        () =>
          collaborator.asUser.mutation(api.serviceAccount.revokeServiceAccount, {
            serviceAccountId: accounts[0].id,
          }),
        ErrorCode.INSUFFICIENT_PERMISSION,
      );
    });

    test("should reject revoking an already revoked service account", async () => {
      const { rawToken, ...saArgs } = await buildServiceAccountArgs(
        owner.publicKey!,
        owner.encryptedPrivateKey!,
        owner.password!,
        owner.salt!,
        encryptedProjectKey,
      );
      await owner.asUser.mutation(api.serviceAccount.createServiceAccount, {
        projectId,
        name: "Double Revoke",
        ...saArgs,
      });

      const accounts = await owner.asUser.query(api.serviceAccount.listServiceAccounts, {
        projectId,
      });
      await owner.asUser.mutation(api.serviceAccount.revokeServiceAccount, {
        serviceAccountId: accounts[0].id,
      });

      await expectConvexError(
        () =>
          owner.asUser.mutation(api.serviceAccount.revokeServiceAccount, {
            serviceAccountId: accounts[0].id,
          }),
        ErrorCode.INVALID_OPERATION,
      );
    });

    test("should reject revoking a nonexistent service account", async () => {
      const fakeId = "invalid_id" as Id<"serviceAccount">;

      await expect(
        owner.asUser.mutation(api.serviceAccount.revokeServiceAccount, {
          serviceAccountId: fakeId,
        }),
      ).rejects.toThrow();
    });
  });

  describe("OIDC policy on create", () => {
    test("should create a service account with OIDC policy", async () => {
      const { rawToken, ...saArgs } = await buildServiceAccountArgs(
        owner.publicKey!,
        owner.encryptedPrivateKey!,
        owner.password!,
        owner.salt!,
        encryptedProjectKey,
      );

      const result = await owner.asUser.mutation(api.serviceAccount.createServiceAccount, {
        projectId,
        name: "OIDC SA",
        ...saArgs,
        oidcIssuer: "https://token.actions.githubusercontent.com",
        oidcSubjectPattern: "repo:org/repo:ref:refs/heads/main",
        oidcAudience: "relic",
      });

      expect(result.id).toBeDefined();

      const accounts = await owner.asUser.query(api.serviceAccount.listServiceAccounts, {
        projectId,
      });
      const sa = accounts.find((a) => a.name === "OIDC SA");
      expect(sa?.oidcIssuer).toBe("https://token.actions.githubusercontent.com");
      expect(sa?.oidcSubjectPattern).toBe("repo:org/repo:ref:refs/heads/main");
      expect(sa?.oidcAudience).toBe("relic");
    });

    test("should reject OIDC issuer without subject", async () => {
      const { rawToken, ...saArgs } = await buildServiceAccountArgs(
        owner.publicKey!,
        owner.encryptedPrivateKey!,
        owner.password!,
        owner.salt!,
        encryptedProjectKey,
      );

      await expectConvexError(
        () =>
          owner.asUser.mutation(api.serviceAccount.createServiceAccount, {
            projectId,
            name: "Bad OIDC",
            ...saArgs,
            oidcIssuer: "https://token.actions.githubusercontent.com",
          }),
        ErrorCode.INVALID_ARGUMENTS,
        "subject pattern is required",
      );
    });

    test("should reject OIDC subject without issuer", async () => {
      const { rawToken, ...saArgs } = await buildServiceAccountArgs(
        owner.publicKey!,
        owner.encryptedPrivateKey!,
        owner.password!,
        owner.salt!,
        encryptedProjectKey,
      );

      await expectConvexError(
        () =>
          owner.asUser.mutation(api.serviceAccount.createServiceAccount, {
            projectId,
            name: "Bad OIDC",
            ...saArgs,
            oidcSubjectPattern: "repo:org/repo:*",
          }),
        ErrorCode.INVALID_ARGUMENTS,
        "issuer is required",
      );
    });
  });

  describe("updateOidcPolicy", () => {
    let serviceAccountId: string;

    beforeEach(async () => {
      const { rawToken, ...saArgs } = await buildServiceAccountArgs(
        owner.publicKey!,
        owner.encryptedPrivateKey!,
        owner.password!,
        owner.salt!,
        encryptedProjectKey,
      );

      const result = await owner.asUser.mutation(api.serviceAccount.createServiceAccount, {
        projectId,
        name: "OIDC Update Target",
        ...saArgs,
      });
      serviceAccountId = result.id;
    });

    test("should set OIDC policy on existing SA", async () => {
      await owner.asUser.mutation(api.serviceAccount.updateOidcPolicy, {
        serviceAccountId: serviceAccountId as Id<"serviceAccount">,
        oidcIssuer: "https://token.actions.githubusercontent.com",
        oidcSubjectPattern: "repo:org/repo:*",
      });

      const accounts = await owner.asUser.query(api.serviceAccount.listServiceAccounts, {
        projectId,
      });
      const sa = accounts.find((a) => a.name === "OIDC Update Target");
      expect(sa?.oidcIssuer).toBe("https://token.actions.githubusercontent.com");
      expect(sa?.oidcSubjectPattern).toBe("repo:org/repo:*");
    });

    test("should clear OIDC policy with null values", async () => {
      await owner.asUser.mutation(api.serviceAccount.updateOidcPolicy, {
        serviceAccountId: serviceAccountId as Id<"serviceAccount">,
        oidcIssuer: "https://token.actions.githubusercontent.com",
        oidcSubjectPattern: "repo:org/repo:*",
      });

      await owner.asUser.mutation(api.serviceAccount.updateOidcPolicy, {
        serviceAccountId: serviceAccountId as Id<"serviceAccount">,
        oidcIssuer: null,
        oidcSubjectPattern: null,
        oidcAudience: null,
      });

      const accounts = await owner.asUser.query(api.serviceAccount.listServiceAccounts, {
        projectId,
      });
      const sa = accounts.find((a) => a.name === "OIDC Update Target");
      expect(sa?.oidcIssuer).toBeUndefined();
      expect(sa?.oidcSubjectPattern).toBeUndefined();
      expect(sa?.oidcAudience).toBeUndefined();
    });

    test("should reject issuer without subject pattern", async () => {
      await expectConvexError(
        () =>
          owner.asUser.mutation(api.serviceAccount.updateOidcPolicy, {
            serviceAccountId: serviceAccountId as Id<"serviceAccount">,
            oidcIssuer: "https://token.actions.githubusercontent.com",
          }),
        ErrorCode.INVALID_ARGUMENTS,
      );
    });

    test("should reject non-owner updating OIDC policy", async () => {
      mockAutumn.setBooleanFeature(owner.userId, "can_share_project", true);
      mockAutumn.setFeature(owner.userId, "additional_shares", 5);

      const projectKey = await unwrapProjectKey(
        encryptedProjectKey,
        owner.encryptedPrivateKey!,
        owner.password!,
        owner.salt!,
      );
      const collabPublicKey = await importPublicKey(collaborator.publicKey!);
      const collabEncryptedProjectKey = await wrapAESKeyWithRSA(projectKey, collabPublicKey);

      await owner.asUser.action(api.projectShare.shareProject, {
        projectId,
        userEmail: collaborator.email,
        encryptedProjectKey: collabEncryptedProjectKey,
      });

      await expectConvexError(
        () =>
          collaborator.asUser.mutation(api.serviceAccount.updateOidcPolicy, {
            serviceAccountId: serviceAccountId as Id<"serviceAccount">,
            oidcIssuer: "https://token.actions.githubusercontent.com",
            oidcSubjectPattern: "repo:org/repo:*",
          }),
        ErrorCode.INSUFFICIENT_PERMISSION,
      );
    });

    test("should reject updating OIDC on revoked SA", async () => {
      await owner.asUser.mutation(api.serviceAccount.revokeServiceAccount, {
        serviceAccountId: serviceAccountId as Id<"serviceAccount">,
      });

      await expectConvexError(
        () =>
          owner.asUser.mutation(api.serviceAccount.updateOidcPolicy, {
            serviceAccountId: serviceAccountId as Id<"serviceAccount">,
            oidcIssuer: "https://token.actions.githubusercontent.com",
            oidcSubjectPattern: "repo:org/repo:*",
          }),
        ErrorCode.INVALID_OPERATION,
      );
    });
  });
});
