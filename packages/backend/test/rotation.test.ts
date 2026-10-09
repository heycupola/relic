import {
  createProjectKey,
  encryptSecret,
  importPublicKey,
  unwrapAESKeyWithRSA,
  wrapAESKeyWithRSA,
} from "@repo/crypto";
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { api, components, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { hashKey } from "../convex/lib/crypto";
import { ErrorCode } from "../convex/lib/errors.ts";
import { DAY_MS, getRotationState, inferValueChangedAt } from "../convex/lib/rotation.ts";
import { SecretValueType } from "../convex/lib/types.ts";
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

describe("Rotation helpers", () => {
  const now = Date.UTC(2026, 0, 1);

  test("classifies secrets by policy", () => {
    const policy = { rotateEveryDays: 90, source: "secret" as const };

    expect(getRotationState({ valueChangedAt: now - 10 * DAY_MS, policy, now }).status).toBe("ok");
    expect(getRotationState({ valueChangedAt: now - 80 * DAY_MS, policy, now }).status).toBe(
      "due_soon",
    );
    expect(getRotationState({ valueChangedAt: now - 90 * DAY_MS, policy, now }).status).toBe(
      "overdue",
    );
    expect(
      getRotationState({ valueChangedAt: now - 400 * DAY_MS, policy: null, now }),
    ).toMatchObject({ status: "no_policy", ageDays: 400, dueAt: null });
  });

  test("scales the due-soon window for short policies", () => {
    const policy = { rotateEveryDays: 7, source: "environment" as const };

    expect(getRotationState({ valueChangedAt: now - 4 * DAY_MS, policy, now }).status).toBe("ok");
    expect(getRotationState({ valueChangedAt: now - 5 * DAY_MS, policy, now }).status).toBe(
      "due_soon",
    );
  });

  test("ignores updatedAt bumps caused by key rotation when inferring value age", () => {
    const secret = { createdAt: now - 300 * DAY_MS, updatedAt: now - 20 * DAY_MS };

    expect(inferValueChangedAt(secret, [])).toBe(secret.updatedAt);
    expect(inferValueChangedAt(secret, [secret.updatedAt + 1_000])).toBe(secret.createdAt);
    expect(inferValueChangedAt(secret, [secret.updatedAt + 30 * DAY_MS])).toBe(secret.updatedAt);
    expect(inferValueChangedAt({ ...secret, valueChangedAt: now }, [secret.updatedAt])).toBe(now);
  });
});

describe("Secret Rotation Hygiene", () => {
  let t: TestConvex<typeof schema>;
  let testUsers: TestUser[] = [];
  let owner: TestUser, collaborator: TestUser, nonCollaborator: TestUser;
  let projectId: Id<"project">;
  let projectKey: CryptoKey;
  let environmentId: Id<"environment">;

  async function createSecret(key: string, value = "value-" + randomString()) {
    const { id } = await owner.asUser.mutation(api.secret.createSecret, {
      encryptedValue: await encryptSecret(projectKey, value),
      environmentId,
      key,
      valueType: "string",
      folderId: undefined,
    });
    return id;
  }

  async function ageSecret(secretId: Id<"secret">, days: number) {
    await t.run(async (ctx) => {
      await ctx.db.patch(secretId, { valueChangedAt: Date.now() - days * DAY_MS });
    });
  }

  async function loadSecret(secretId: Id<"secret">) {
    const secret = await t.run(async (ctx) => await ctx.db.get(secretId));
    if (!secret) throw new Error("Secret not found");
    return secret;
  }

  beforeEach(async () => {
    t = convexTest(schema, modules);

    const betterAuthSchema = await import("../convex/betterAuth/generatedSchema.ts");
    t.registerComponent("betterAuth", betterAuthSchema.default, betterAuthModules);

    testUsers = await getTestUsers(t);
    owner = testUsers[0]!;
    collaborator = testUsers[1]!;
    nonCollaborator = testUsers[2]!;

    mockAutumn.setFeature(owner.userId, "projects", 5);
    mockAutumn.setBooleanFeature(owner.userId, "can_share_project", true);
    mockAutumn.setFeature(owner.userId, "additional_shares", 5);
    mockAutumn.setFeature(collaborator.userId, "projects", 5);
    mockAutumn.setFeature(nonCollaborator.userId, "projects", 5);

    const { encryptedProjectKey } = await createProjectKey(owner.publicKey!);
    const result = await owner.asUser.action(api.project.createProject, {
      encryptedProjectKey,
      name: "rotation-project-" + randomString(),
    });
    projectId = assertProjectCreated(result);
    projectKey = await unwrapAESKeyWithRSA(encryptedProjectKey, owner.privateKey!);

    const collaboratorPublicKey = await importPublicKey(collaborator.publicKey!);
    await owner.asUser.action(api.projectShare.shareProject, {
      encryptedProjectKey: await wrapAESKeyWithRSA(projectKey, collaboratorPublicKey),
      projectId,
      userEmail: collaborator.email,
    });

    const environment = await owner.asUser.mutation(api.environment.createEnvironment, {
      name: "production",
      projectId,
    });
    environmentId = environment.id;
  }, 30_000);

  afterEach(() => {
    mockAutumn.reset();
  });

  describe("valueChangedAt tracking", () => {
    test("is set when a secret is created", async () => {
      const before = Date.now();
      const secretId = await createSecret("STRIPE_KEY");
      const secret = await loadSecret(secretId);

      expect(secret.valueChangedAt).toBeGreaterThanOrEqual(before);
      expect(secret.valueChangedAt).toBe(secret.createdAt);
    });

    test("does not change on rename or scope change", async () => {
      const secretId = await createSecret("STRIPE_KEY");
      await ageSecret(secretId, 100);
      const { valueChangedAt } = await loadSecret(secretId);

      await owner.asUser.mutation(api.secret.updateSecret, {
        secretId,
        updates: { key: "STRIPE_SECRET_KEY", valueType: SecretValueType.String },
      });

      const { encryptedValue } = await loadSecret(secretId);
      await owner.asUser.mutation(api.secret.updateSecretBulk, {
        environmentId,
        secrets: [
          {
            secretId,
            key: "STRIPE_SECRET_KEY",
            encryptedValue,
            valueType: "string",
            scope: "server",
          },
        ],
        mode: "overwrite",
      });

      const secret = await loadSecret(secretId);
      expect(secret.key).toBe("STRIPE_SECRET_KEY");
      expect(secret.scope).toBe("server");
      expect(secret.valueChangedAt).toBe(valueChangedAt);
    });

    test("resets when the value changes through updateSecret", async () => {
      const secretId = await createSecret("STRIPE_KEY");
      await ageSecret(secretId, 100);
      const before = Date.now();

      await owner.asUser.mutation(api.secret.updateSecret, {
        secretId,
        updates: {
          encryptedValue: await encryptSecret(projectKey, "rotated"),
          valueType: SecretValueType.String,
        },
      });

      expect((await loadSecret(secretId)).valueChangedAt).toBeGreaterThanOrEqual(before);
    });

    test("resets when the value changes through updateSecretBulk", async () => {
      const secretId = await createSecret("STRIPE_KEY");
      await ageSecret(secretId, 100);
      const before = Date.now();

      await owner.asUser.mutation(api.secret.updateSecretBulk, {
        environmentId,
        secrets: [
          {
            secretId,
            key: "STRIPE_KEY",
            encryptedValue: await encryptSecret(projectKey, "rotated"),
            valueType: "string",
          },
        ],
        mode: "overwrite",
      });

      expect((await loadSecret(secretId)).valueChangedAt).toBeGreaterThanOrEqual(before);
    });

    test("is preserved by project key rotation", async () => {
      const secretId = await createSecret("STRIPE_KEY", "sk_live_123");
      await ageSecret(secretId, 200);
      const { valueChangedAt } = await loadSecret(secretId);

      const share = await collaborator.asUser.query(
        api.projectShare.getProjectShareByProjectForCurrentUser,
        { projectId },
      );
      const { encryptedProjectKey: newEncryptedProjectKey, projectKey: newProjectKey } =
        await createProjectKey(owner.publicKey!);

      await owner.asUser.action(api.projectShare.revokeShareWithRotation, {
        shareId: share!.id,
        newEncryptedProjectKey,
        rewrappedShares: [],
        reEncryptedSecrets: [
          { secretId, newEncryptedValue: await encryptSecret(newProjectKey, "sk_live_123") },
        ],
      });

      const secret = await loadSecret(secretId);
      expect(secret.encryptionKeyVersion).toBe(2);
      expect(secret.valueChangedAt).toBe(valueChangedAt);
    });

    test("pins the inferred age of legacy rows before key rotation re-encrypts them", async () => {
      const secretId = await createSecret("LEGACY_KEY", "legacy");
      const createdAt = Date.now() - 300 * DAY_MS;
      const updatedAt = Date.now() - 50 * DAY_MS;
      await t.run(async (ctx) => {
        await ctx.db.patch(secretId, { valueChangedAt: undefined, createdAt, updatedAt });
      });

      const share = await collaborator.asUser.query(
        api.projectShare.getProjectShareByProjectForCurrentUser,
        { projectId },
      );
      const { encryptedProjectKey: newEncryptedProjectKey, projectKey: newProjectKey } =
        await createProjectKey(owner.publicKey!);

      await owner.asUser.action(api.projectShare.revokeShareWithRotation, {
        shareId: share!.id,
        newEncryptedProjectKey,
        rewrappedShares: [],
        reEncryptedSecrets: [
          { secretId, newEncryptedValue: await encryptSecret(newProjectKey, "legacy") },
        ],
      });

      expect((await loadSecret(secretId)).valueChangedAt).toBe(updatedAt);
    });

    test("is exposed through getEnvironmentData", async () => {
      const secretId = await createSecret("STRIPE_KEY");
      await owner.asUser.mutation(api.rotation.setEnvironmentRotationPolicy, {
        environmentId,
        rotateEveryDays: 90,
      });
      await owner.asUser.mutation(api.rotation.setSecretRotationPolicy, {
        secretId,
        rotateEveryDays: 30,
      });

      const data = await owner.asUser.query(api.environment.getEnvironmentData, {
        environmentId,
      });

      expect(data.environment.rotateEveryDays).toBe(90);
      expect(data.secrets[0]?.rotateEveryDays).toBe(30);
      expect(data.secrets[0]?.valueChangedAt).toBe((await loadSecret(secretId)).valueChangedAt);
    });
  });

  describe("backfill", () => {
    test("derives valueChangedAt from existing timestamps", async () => {
      const editedId = await createSecret("EDITED");
      const reEncryptedId = await createSecret("RE_ENCRYPTED");
      const createdAt = Date.now() - 400 * DAY_MS;
      const updatedAt = Date.now() - 30 * DAY_MS;
      const rotatedAt = Date.now() - 60 * DAY_MS;

      await t.run(async (ctx) => {
        await ctx.db.patch(editedId, { valueChangedAt: undefined, createdAt, updatedAt });
        await ctx.db.patch(reEncryptedId, {
          valueChangedAt: undefined,
          createdAt,
          updatedAt: rotatedAt - 1_000,
        });
        await ctx.db.insert("keyRotation", {
          projectId,
          oldKeyVersion: 1,
          newKeyVersion: 2,
          rotatedBy: owner.userId,
          secretsReEncrypted: 1,
          sharesUpdated: 0,
          createdAt: rotatedAt,
        });
      });

      const status = await owner.asUser.query(api.rotation.getProjectRotationStatus, {
        projectId,
      });
      const byKey = new Map(status.secrets.map((entry) => [entry.key, entry]));
      expect(byKey.get("EDITED")?.ageDays).toBe(30);
      expect(byKey.get("RE_ENCRYPTED")?.ageDays).toBe(400);

      const result = await t.mutation(internal.rotation._backfillValueChangedAt, {});
      expect(result).toEqual({ updated: 2, isDone: true });

      expect((await loadSecret(editedId)).valueChangedAt).toBe(updatedAt);
      expect((await loadSecret(reEncryptedId)).valueChangedAt).toBe(createdAt);

      const again = await t.mutation(internal.rotation._backfillValueChangedAt, {});
      expect(again.updated).toBe(0);
    });

    test("keeps the inferred age when a legacy secret is renamed", async () => {
      const secretId = await createSecret("LEGACY");
      const updatedAt = Date.now() - 60 * DAY_MS;
      await t.run(async (ctx) => {
        await ctx.db.patch(secretId, { valueChangedAt: undefined, updatedAt });
      });

      await owner.asUser.mutation(api.secret.updateSecret, {
        secretId,
        updates: { key: "LEGACY_RENAMED", valueType: SecretValueType.String },
      });

      expect((await loadSecret(secretId)).valueChangedAt).toBe(updatedAt);
    });
  });

  describe("policies", () => {
    test("secret policy overrides environment policy", async () => {
      const inherited = await createSecret("INHERITED");
      const overridden = await createSecret("OVERRIDDEN");
      const unmanaged = await createSecret("UNMANAGED");
      await ageSecret(inherited, 100);
      await ageSecret(overridden, 100);
      await ageSecret(unmanaged, 100);

      const { id: stagingId } = await owner.asUser.mutation(api.environment.createEnvironment, {
        name: "staging",
        projectId,
      });
      await owner.asUser.mutation(api.secret.createSecret, {
        encryptedValue: await encryptSecret(projectKey, "x"),
        environmentId: stagingId,
        key: "STAGING_ONLY",
        valueType: "string",
      });

      await owner.asUser.mutation(api.rotation.setEnvironmentRotationPolicy, {
        environmentId,
        rotateEveryDays: 90,
      });
      await owner.asUser.mutation(api.rotation.setSecretRotationPolicy, {
        secretId: overridden,
        rotateEveryDays: 365,
      });

      const status = await owner.asUser.query(api.rotation.getProjectRotationStatus, {
        projectId,
        environmentId,
      });
      const byKey = new Map(status.secrets.map((entry) => [entry.key, entry]));

      expect(status.secrets).toHaveLength(3);
      expect(byKey.get("INHERITED")).toMatchObject({
        status: "overdue",
        rotateEveryDays: 90,
        policySource: "environment",
        ageDays: 100,
      });
      expect(byKey.get("OVERRIDDEN")).toMatchObject({
        status: "ok",
        rotateEveryDays: 365,
        policySource: "secret",
      });

      await owner.asUser.mutation(api.rotation.setEnvironmentRotationPolicy, {
        environmentId,
        rotateEveryDays: null,
      });
      const cleared = await owner.asUser.query(api.rotation.getProjectRotationStatus, {
        projectId,
        environmentId,
      });
      expect(cleared.secrets.find((entry) => entry.key === "UNMANAGED")?.status).toBe("no_policy");
    });

    test("orders and filters entries that need attention", async () => {
      const overdue = await createSecret("OVERDUE");
      const dueSoon = await createSecret("DUE_SOON");
      await createSecret("FRESH");
      await ageSecret(overdue, 45);
      await ageSecret(dueSoon, 25);

      await owner.asUser.mutation(api.rotation.setEnvironmentRotationPolicy, {
        environmentId,
        rotateEveryDays: 30,
      });

      const all = await owner.asUser.query(api.rotation.getProjectRotationStatus, { projectId });
      expect(all.secrets.map((entry) => entry.key)).toEqual(["OVERDUE", "DUE_SOON", "FRESH"]);

      const attention = await owner.asUser.query(api.rotation.getProjectRotationStatus, {
        projectId,
        attentionOnly: true,
      });
      expect(attention.secrets.map((entry) => entry.status)).toEqual(["overdue", "due_soon"]);
    });

    test("does not touch the secret's updatedAt or value age", async () => {
      const secretId = await createSecret("STRIPE_KEY");
      const before = await loadSecret(secretId);

      await owner.asUser.mutation(api.rotation.setSecretRotationPolicy, {
        secretId,
        rotateEveryDays: 90,
      });

      const after = await loadSecret(secretId);
      expect(after.rotateEveryDays).toBe(90);
      expect(after.updatedAt).toBe(before.updatedAt);
      expect(after.valueChangedAt).toBe(before.valueChangedAt);
    });

    test("rejects invalid intervals", async () => {
      const secretId = await createSecret("STRIPE_KEY");

      for (const rotateEveryDays of [0, -5, 1.5, 4000]) {
        await expectConvexError(
          () =>
            owner.asUser.mutation(api.rotation.setSecretRotationPolicy, {
              secretId,
              rotateEveryDays,
            }),
          ErrorCode.INVALID_ARGUMENTS,
        );
      }

      await expectConvexError(
        () =>
          owner.asUser.mutation(api.rotation.setEnvironmentRotationPolicy, {
            environmentId,
            rotateEveryDays: 0,
          }),
        ErrorCode.INVALID_ARGUMENTS,
      );
    });

    test("records policy changes in the audit log", async () => {
      const secretId = await createSecret("STRIPE_KEY");
      await owner.asUser.mutation(api.rotation.setSecretRotationPolicy, {
        secretId,
        rotateEveryDays: 90,
      });

      const logs = await t.run(async (ctx) =>
        ctx.db
          .query("actionLog")
          .withIndex("by_project", (q) => q.eq("projectId", projectId))
          .collect(),
      );
      const policyLog = logs.find((entry) => entry.action === "rotation.policy_updated");
      expect(policyLog?.metadata).toMatchObject({ key: "STRIPE_KEY", rotateEveryDays: 90 });
    });
  });

  describe("access control", () => {
    test("collaborators can read status and set policies", async () => {
      const secretId = await createSecret("STRIPE_KEY");

      await collaborator.asUser.mutation(api.rotation.setSecretRotationPolicy, {
        secretId,
        rotateEveryDays: 60,
      });
      const status = await collaborator.asUser.query(api.rotation.getProjectRotationStatus, {
        projectId,
      });

      expect(status.secrets[0]?.rotateEveryDays).toBe(60);
    });

    test("non-collaborators cannot read status or set policies", async () => {
      const secretId = await createSecret("STRIPE_KEY");

      await expectConvexError(
        () => nonCollaborator.asUser.query(api.rotation.getProjectRotationStatus, { projectId }),
        ErrorCode.INSUFFICIENT_PERMISSION,
      );
      await expectConvexError(
        () =>
          nonCollaborator.asUser.mutation(api.rotation.setSecretRotationPolicy, {
            secretId,
            rotateEveryDays: 30,
          }),
        ErrorCode.INSUFFICIENT_PERMISSION,
      );
      await expectConvexError(
        () =>
          nonCollaborator.asUser.mutation(api.rotation.setEnvironmentRotationPolicy, {
            environmentId,
            rotateEveryDays: 30,
          }),
        ErrorCode.INSUFFICIENT_PERMISSION,
      );
    });

    test("rejects an environment from another project", async () => {
      const { encryptedProjectKey } = await createProjectKey(nonCollaborator.publicKey!);
      const otherProjectId = assertProjectCreated(
        await nonCollaborator.asUser.action(api.project.createProject, {
          encryptedProjectKey,
          name: "other-" + randomString(),
        }),
      );
      const { id: otherEnvironmentId } = await nonCollaborator.asUser.mutation(
        api.environment.createEnvironment,
        { name: "production", projectId: otherProjectId },
      );

      await expectConvexError(
        () =>
          owner.asUser.query(api.rotation.getProjectRotationStatus, {
            projectId,
            environmentId: otherEnvironmentId,
          }),
        ErrorCode.ENVIRONMENT_NOT_FOUND,
      );
    });

    test("listRotationAlerts spans owned and shared projects only", async () => {
      const secretId = await createSecret("STRIPE_KEY");
      await ageSecret(secretId, 120);
      await owner.asUser.mutation(api.rotation.setEnvironmentRotationPolicy, {
        environmentId,
        rotateEveryDays: 90,
      });

      const ownerAlerts = await owner.asUser.query(api.rotation.listRotationAlerts, {});
      expect(ownerAlerts.overdueCount).toBe(1);
      expect(ownerAlerts.items[0]).toMatchObject({
        key: "STRIPE_KEY",
        projectId,
        environmentName: "production",
        status: "overdue",
      });

      const collaboratorAlerts = await collaborator.asUser.query(
        api.rotation.listRotationAlerts,
        {},
      );
      expect(collaboratorAlerts.overdueCount).toBe(1);

      const strangerAlerts = await nonCollaborator.asUser.query(
        api.rotation.listRotationAlerts,
        {},
      );
      expect(strangerAlerts).toEqual({
        items: [],
        overdueCount: 0,
        dueSoonCount: 0,
        truncated: false,
      });
    });
  });

  describe("service account status endpoint", () => {
    async function createServiceAccount(overrides: { revokedAt?: number } = {}) {
      const rawToken = "rsk_" + randomString(48);
      const hashedToken = await hashKey(rawToken);
      await t.run(async (ctx) => {
        await ctx.db.insert("serviceAccount", {
          projectId,
          name: "ci",
          publicKey: "pk",
          encryptedPrivateKey: "epk",
          salt: "salt",
          encryptedProjectKey: "eprk",
          hashedToken,
          tokenPrefix: rawToken.slice(0, 12),
          createdBy: owner.userId,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          ...overrides,
        });
      });
      return rawToken;
    }

    function fetchStatus(token: string, body: Record<string, unknown> = {}) {
      return t.fetch("/api/sa/rotation/status", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }

    beforeEach(async () => {
      await owner.asUser.mutation(components.betterAuth.user.upgradeToPro, {
        userId: owner.userId,
      });
    });

    test("returns names and ages for the token's project without values", async () => {
      const overdueId = await createSecret("STRIPE_KEY");
      await ageSecret(overdueId, 120);
      await owner.asUser.mutation(api.rotation.setEnvironmentRotationPolicy, {
        environmentId,
        rotateEveryDays: 90,
      });

      const response = await fetchStatus(await createServiceAccount(), {
        environmentName: "Production",
      });
      expect(response.status).toBe(200);

      const body = (await response.json()) as {
        projectId: string;
        secrets: Array<Record<string, unknown>>;
      };
      expect(body.projectId).toBe(projectId);
      expect(body.secrets).toHaveLength(1);
      expect(body.secrets[0]).toMatchObject({
        key: "STRIPE_KEY",
        status: "overdue",
        rotateEveryDays: 90,
        policySource: "environment",
      });
      expect(body.secrets[0]).not.toHaveProperty("encryptedValue");
    });

    test("rejects missing and revoked tokens", async () => {
      const missing = await t.fetch("/api/sa/rotation/status", { method: "POST", body: "{}" });
      expect(missing.status).toBe(401);

      const revoked = await fetchStatus(await createServiceAccount({ revokedAt: Date.now() }));
      expect(revoked.status).toBe(401);
    });

    test("returns 404 for an unknown environment", async () => {
      const response = await fetchStatus(await createServiceAccount(), {
        environmentName: "staging",
      });
      expect(response.status).toBe(404);
    });
  });

  describe("weekly digest", () => {
    test("is opt-in and can be toggled", async () => {
      expect(await owner.asUser.query(api.rotation.getRotationDigestPreference, {})).toEqual({
        enabled: false,
        lastSentAt: null,
      });

      await owner.asUser.mutation(api.rotation.setRotationDigestPreference, { enabled: true });
      await owner.asUser.mutation(api.rotation.setRotationDigestPreference, { enabled: true });
      expect((await owner.asUser.query(api.rotation.getRotationDigestPreference, {})).enabled).toBe(
        true,
      );

      const rows = await t.run(async (ctx) => ctx.db.query("rotationDigestSubscription").collect());
      expect(rows).toHaveLength(1);

      await owner.asUser.mutation(api.rotation.setRotationDigestPreference, { enabled: false });
      expect((await owner.asUser.query(api.rotation.getRotationDigestPreference, {})).enabled).toBe(
        false,
      );
    });

    test("only goes to subscribers with overdue secrets", async () => {
      const secretId = await createSecret("STRIPE_KEY");
      await ageSecret(secretId, 120);
      await owner.asUser.mutation(api.rotation.setEnvironmentRotationPolicy, {
        environmentId,
        rotateEveryDays: 90,
      });

      await owner.asUser.mutation(api.rotation.setRotationDigestPreference, { enabled: true });
      await nonCollaborator.asUser.mutation(api.rotation.setRotationDigestPreference, {
        enabled: true,
      });

      const first = await t.action(internal.rotation._sendWeeklyRotationDigests, {});
      expect(first.sent).toBe(1);

      const ownerPreference = await owner.asUser.query(
        api.rotation.getRotationDigestPreference,
        {},
      );
      expect(ownerPreference.lastSentAt).not.toBeNull();
      const strangerPreference = await nonCollaborator.asUser.query(
        api.rotation.getRotationDigestPreference,
        {},
      );
      expect(strangerPreference.lastSentAt).toBeNull();

      const second = await t.action(internal.rotation._sendWeeklyRotationDigests, {});
      expect(second.sent).toBe(0);
    });
  });
});
