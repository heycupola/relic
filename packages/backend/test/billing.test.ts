import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, components, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { getWebhookCustomerId } from "../convex/billing";
import { ErrorCode } from "../convex/lib/errors";
import {
  GRACE_PERIOD_MS,
  getAccessibleProjectIds,
  getPlanState,
  PLANS,
  paidSharesFor,
} from "../convex/lib/plans";
import { verifySvixSignature } from "../convex/lib/svix";
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

describe("plans", () => {
  const now = 1_700_000_000_000;

  test("free and pro limits", () => {
    expect(PLANS.free.includedProjects).toBe(1);
    expect(PLANS.free.canShare).toBe(false);
    expect(PLANS.pro.includedProjects).toBe(5);
    expect(PLANS.pro.includedSharesPerProject).toBe(5);
  });

  test("pro users are never restricted", () => {
    const state = getPlanState({ hasPro: true }, now);
    expect(state).toMatchObject({ plan: "pro", isPro: true, isRestricted: false });
  });

  test("downgraded users keep access during the grace period", () => {
    const state = getPlanState({ hasPro: false, planDowngradedAt: now - 1000 }, now);
    expect(state.inGracePeriod).toBe(true);
    expect(state.gracePeriodDaysRemaining).toBe(7);
    expect(state.isRestricted).toBe(false);
  });

  test("grace period expires after seven days", () => {
    const state = getPlanState({ hasPro: false, planDowngradedAt: now - GRACE_PERIOD_MS - 1 }, now);
    expect(state.inGracePeriod).toBe(false);
    expect(state.isRestricted).toBe(true);
  });

  test("restricted users keep only their newest project", () => {
    const state = getPlanState({ hasPro: false, planDowngradedAt: 0 }, now);
    const projects = [
      { _id: "a", createdAt: 1 },
      { _id: "b", createdAt: 3 },
      { _id: "c", createdAt: 2 },
    ];
    expect([...getAccessibleProjectIds(projects, state)]).toEqual(["b"]);
  });

  test("only shares above the included five are paid", () => {
    expect(paidSharesFor(0)).toBe(0);
    expect(paidSharesFor(5)).toBe(0);
    expect(paidSharesFor(7)).toBe(2);
  });
});

describe("getWebhookCustomerId", () => {
  test("reads v2 billing.updated payloads", () => {
    expect(getWebhookCustomerId({ type: "billing.updated", data: { customer_id: "u1" } })).toBe(
      "u1",
    );
  });

  test("reads legacy customer.products.updated payloads", () => {
    expect(getWebhookCustomerId({ data: { customer: { id: "u2" } } })).toBe("u2");
  });

  test("rejects missing or malformed ids", () => {
    expect(getWebhookCustomerId({})).toBeNull();
    expect(getWebhookCustomerId(null)).toBeNull();
    expect(getWebhookCustomerId({ data: { customer_id: 42 } })).toBeNull();
    expect(getWebhookCustomerId({ data: { customer_id: "x".repeat(200) } })).toBeNull();
  });
});

describe("billing integration", () => {
  let t: TestConvex<typeof schema>;
  let owner: TestUser;
  let other: TestUser;
  let third: TestUser;

  beforeEach(async () => {
    t = convexTest(schema, modules);
    const betterAuthSchema = await import("../convex/betterAuth/generatedSchema.ts");
    t.registerComponent("betterAuth", betterAuthSchema.default, betterAuthModules);
    [owner, other, third] = (await getTestUsers(t)) as [TestUser, TestUser, TestUser];
  });

  afterEach(() => {
    mockBilling.reset();
    vi.useRealTimers();
  });

  const loadUser = (userId: string) =>
    t.run((ctx) =>
      ctx.runQuery(components.betterAuth.user.loadUserById, {
        userId: userId as Id<"user"> as never,
      }),
    );

  test("refreshing applies an upgrade from Autumn", async () => {
    mockBilling.setPro(owner.userId, true);

    const result = await owner.asUser.action(api.billing.refreshMyPlan, {});

    expect(result.hasPro).toBe(true);
    expect((await loadUser(owner.userId)).hasPro).toBe(true);
  });

  test("refreshing applies a cancellation and starts the grace period", async () => {
    await setPlan(t, owner.userId, "pro");
    mockBilling.setPro(owner.userId, false);

    await t.action(internal.billing._refreshPlan, { userId: owner.userId });

    const user = await loadUser(owner.userId);
    expect(user.hasPro).toBe(false);
    expect(user.planDowngradedAt).toBeTypeOf("number");

    const overview = await owner.asUser.query(api.billing.getBillingOverview, {});
    expect(overview.inGracePeriod).toBe(true);
  });

  test("daily reconcile fixes plans that missed a webhook", async () => {
    await setPlan(t, owner.userId, "pro");
    await setPlan(t, other.userId, "pro");
    mockBilling.setPro(owner.userId, false);
    mockBilling.setPro(other.userId, true);

    await t.action(internal.billing._reconcilePlans, {});

    expect((await loadUser(owner.userId)).hasPro).toBe(false);
    expect((await loadUser(owner.userId)).planDowngradedAt).toBeTypeOf("number");
    expect((await loadUser(other.userId)).hasPro).toBe(true);
  });

  test("daily reconcile restores a resubscription during the grace period", async () => {
    await setPlan(t, owner.userId, "pro");
    mockBilling.setPro(owner.userId, false);
    await t.action(internal.billing._refreshPlan, { userId: owner.userId });

    mockBilling.setPro(owner.userId, true);
    await t.action(internal.billing._reconcilePlans, {});

    expect((await loadUser(owner.userId)).hasPro).toBe(true);
  });

  test("usage sync tracks only the difference", async () => {
    vi.useFakeTimers();
    await setPlan(t, owner.userId, "pro");

    for (const name of ["a", "b"]) {
      await owner.asUser.action(api.project.createProject, {
        name,
        encryptedProjectKey: "epk",
        confirmPayment: true,
      });
    }
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(mockBilling.getUsage(owner.userId, "projects")).toBe(2);

    mockBilling.tracked = [];
    await owner.asUser.action(api.project.createProject, {
      name: "c",
      encryptedProjectKey: "epk",
      confirmPayment: true,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(mockBilling.getUsage(owner.userId, "projects")).toBe(3);
    expect(mockBilling.tracked).toEqual([
      { customerId: owner.userId, featureId: "projects", value: 1 },
    ]);
  });

  test("pro users confirm before paying for a sixth project", async () => {
    await setPlan(t, owner.userId, "pro");

    for (let i = 0; i < PLANS.pro.includedProjects; i++) {
      const result = await owner.asUser.action(api.project.createProject, {
        name: `p${i}`,
        encryptedProjectKey: "epk",
      });
      expect(result.status).toBe("success");
    }

    const unconfirmed = await owner.asUser.action(api.project.createProject, {
      name: "extra",
      encryptedProjectKey: "epk",
    });
    expect(unconfirmed.status).toBe("requiresConfirmation");

    const confirmed = await owner.asUser.action(api.project.createProject, {
      name: "extra",
      encryptedProjectKey: "epk",
      confirmPayment: true,
    });
    expect(confirmed.status).toBe("success");

    const overview = await owner.asUser.query(api.billing.getBillingOverview, {});
    expect(overview.projects).toEqual({ active: 6, included: 5, paid: 1 });
  });

  test("free users cannot share and get a checkout link", async () => {
    const created = await owner.asUser.action(api.project.createProject, {
      name: "solo",
      encryptedProjectKey: "epk",
    });
    if (created.status !== "success") throw new Error("expected success");

    const result = await owner.asUser.action(api.projectShare.shareProject, {
      projectId: created.projectId,
      userEmail: other.email,
      encryptedProjectKey: "shared-epk",
    });

    expect(result).toMatchObject({ success: false, requiresProPlan: true });
    expect("checkoutUrl" in result && result.checkoutUrl).toContain(owner.userId);
  });

  test("shares beyond the included five need confirmation", async () => {
    await setPlan(t, owner.userId, "pro");
    const created = await owner.asUser.action(api.project.createProject, {
      name: "team",
      encryptedProjectKey: "epk",
    });
    if (created.status !== "success") throw new Error("expected success");

    const users = (await getTestUsers(t)).slice(0, PLANS.pro.includedSharesPerProject);
    for (const user of users) {
      const shared = await owner.asUser.action(api.projectShare.shareProject, {
        projectId: created.projectId,
        userEmail: user.email,
        encryptedProjectKey: "shared-epk",
      });
      expect(shared.success).toBe(true);
    }

    const extra = await owner.asUser.action(api.projectShare.shareProject, {
      projectId: created.projectId,
      userEmail: third.email,
      encryptedProjectKey: "shared-epk",
    });
    expect(extra).toMatchObject({ success: false, requiresConfirmation: true });

    const confirmed = await owner.asUser.action(api.projectShare.shareProject, {
      projectId: created.projectId,
      userEmail: third.email,
      encryptedProjectKey: "shared-epk",
      confirmPayment: true,
    });
    expect(confirmed.success).toBe(true);

    const limits = await owner.asUser.action(api.projectShare.getShareLimits, {
      projectId: created.projectId,
    });
    expect(limits).toMatchObject({ totalSharesCount: 6, purchasedSharesCount: 1 });
  });

  describe("account deletion", () => {
    test("is aborted while the Pro subscription cannot be cancelled", async () => {
      await setPlan(t, owner.userId, "pro");
      mockBilling.failCancellation = true;

      await expectConvexError(
        () => owner.asUser.action(api.user.deleteAccount, {}),
        ErrorCode.EXTERNAL_SERVICE_ERROR,
        "your account was not deleted",
      );

      const user = await loadUser(owner.userId);
      expect(user.hasPro).toBe(true);
      const deleted = await t.run((ctx) => ctx.db.query("deletedAccount").collect());
      expect(deleted).toHaveLength(0);
    });

    test("proceeds when cancellation fails but Autumn shows no active subscription", async () => {
      vi.useFakeTimers();
      await setPlan(t, owner.userId, "pro");
      mockBilling.failCancellation = true;
      mockBilling.setPro(owner.userId, false);

      await owner.asUser.action(api.user.deleteAccount, {});
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      await expect(loadUser(owner.userId)).rejects.toThrow();
    });

    test("deletes owned data in batches and revokes shares", async () => {
      vi.useFakeTimers();
      await setPlan(t, owner.userId, "pro");
      await setPlan(t, other.userId, "pro");

      const owned = await owner.asUser.action(api.project.createProject, {
        name: "owned",
        encryptedProjectKey: "epk",
      });
      if (owned.status !== "success") throw new Error("expected success");
      const { id: environmentId } = await owner.asUser.mutation(api.environment.createEnvironment, {
        projectId: owned.projectId,
        name: "production",
      });
      await t.run(async (ctx) => {
        const now = Date.now();
        for (let i = 0; i < 450; i++) {
          await ctx.db.insert("secret", {
            projectId: owned.projectId,
            environmentId,
            key: `K_${i}`,
            encryptedValue: "x",
            valueType: "string",
            scope: "shared",
            encryptionKeyVersion: 1,
            isDeleted: false,
            createdBy: owner.userId,
            createdAt: now,
            updatedBy: owner.userId,
            updatedAt: now,
          });
        }
      });
      await owner.asUser.action(api.projectShare.shareProject, {
        projectId: owned.projectId,
        userEmail: third.email,
        encryptedProjectKey: "shared-epk",
      });

      const foreign = await other.asUser.action(api.project.createProject, {
        name: "foreign",
        encryptedProjectKey: "epk",
      });
      if (foreign.status !== "success") throw new Error("expected success");
      await other.asUser.action(api.projectShare.shareProject, {
        projectId: foreign.projectId,
        userEmail: owner.email,
        encryptedProjectKey: "shared-epk",
      });

      const result = await owner.asUser.action(api.user.deleteAccount, {});
      expect(result).toEqual({ success: true });
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      await expect(loadUser(owner.userId)).rejects.toThrow();

      await t.run(async (ctx) => {
        expect(await ctx.db.get(owned.projectId)).toBeNull();
        expect(await ctx.db.get(foreign.projectId)).not.toBeNull();
        const secrets = await ctx.db
          .query("secret")
          .withIndex("by_project", (q) => q.eq("projectId", owned.projectId))
          .collect();
        expect(secrets).toHaveLength(0);
        const shares = await ctx.db.query("projectShare").collect();
        expect(shares.filter((s) => s.userId === owner.userId)).toHaveLength(0);
        expect(shares.filter((s) => s.projectId === owned.projectId)).toHaveLength(0);

        const [record] = await ctx.db.query("deletedAccount").collect();
        expect(record).toMatchObject({ hadProPlan: true, projectsDeleted: 1, sharesRevoked: 2 });
      });
    });
  });
});

describe("verifySvixSignature", () => {
  const secretBytes = new TextEncoder().encode("test_secret");
  const secret = `whsec_${btoa(String.fromCharCode(...Array.from(secretBytes)))}`;

  async function signPayload(payload: string, svixId: string, timestampSeconds: number) {
    const secretBuffer = new ArrayBuffer(secretBytes.length);
    new Uint8Array(secretBuffer).set(secretBytes);
    const key = await crypto.subtle.importKey(
      "raw",
      secretBuffer,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signatureBytes = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(`${svixId}.${timestampSeconds}.${payload}`),
    );
    return `v1,${btoa(String.fromCharCode(...Array.from(new Uint8Array(signatureBytes))))}`;
  }

  const headers = (id: string | null, timestamp: string | null, signature: string | null) => ({
    "svix-id": id,
    "svix-timestamp": timestamp,
    "svix-signature": signature,
  });

  test("valid signature with recent timestamp returns true", async () => {
    const payload = '{"type":"billing.updated"}';
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = await signPayload(payload, "msg_123", timestamp);
    expect(
      await verifySvixSignature(payload, headers("msg_123", String(timestamp), signature), secret),
    ).toBe(true);
  });

  test("expired timestamp returns false", async () => {
    const payload = '{"type":"billing.updated"}';
    const timestamp = Math.floor(Date.now() / 1000) - 600;
    const signature = await signPayload(payload, "msg_123", timestamp);
    expect(
      await verifySvixSignature(payload, headers("msg_123", String(timestamp), signature), secret),
    ).toBe(false);
  });

  test("invalid signature returns false", async () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    expect(
      await verifySvixSignature("{}", headers("msg_123", timestamp, "v1,invalid"), secret),
    ).toBe(false);
  });

  test("missing headers return false", async () => {
    expect(await verifySvixSignature("{}", headers(null, null, null), secret)).toBe(false);
  });
});
