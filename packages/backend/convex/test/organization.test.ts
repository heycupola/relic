import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import schema from "../schema";
import { createMockAutumn } from "./helpers/autumn.mock";
import { getTestUsers, type TestUser } from "./helpers/setup";

const modules = import.meta.glob("../**/*.ts");

vi.mock("../rateLimiter", () => ({
  rateLimiter: {
    limit: vi.fn().mockResolvedValue({ ok: true, retryAfter: 0 }),
    check: vi.fn().mockResolvedValue({ ok: true, retryAfter: 0 }),
    reset: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@convex-dev/rate-limiter/convex.config", () => ({
  default: {},
}));

// NOTE: error messages are not fully written, only the beginnings are shown
const mockAutumn = createMockAutumn(async (ctx) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return { customerId: identity.subject };
});

function mockInitLocalAutumn(identity: {
  customerId: string;
  customerData?: {
    name?: string | null;
    email?: string | null;
  };
}) {
  return createMockAutumn(async (_ctx) => {
    return { customerId: identity.customerId, customerData: identity.customerData };
  });
}

vi.mock("../autumn", () => ({
  autumn: mockAutumn,
  initLocalAutumn: mockInitLocalAutumn,
}));

describe("organization.ts", () => {
  let t: TestConvex<typeof schema>;
  let testUsers: Map<string, TestUser> = new Map();
  let owner: TestUser;
  let member: TestUser;
  let non_member: TestUser;

  const organizationId = "org-id";
  const wrapperOrgKey = "org-key";

  beforeEach(async () => {
    t = convexTest(schema, modules);

    testUsers = await getTestUsers(t);

    owner = testUsers.get("user1")!;
    member = testUsers.get("user2")!;
    non_member = testUsers.get("user3")!;

    await member.asUser.mutation(api.userKey.storeUserKey, {
      encryptedPrivateKey: "member-encrypted-private-key",
      publicKey: "member-public-key",
      salt: "member-salt",
    });
  });

  afterEach(() => {
    mockAutumn.reset();
  });

  describe("createPersonalProject", () => {
    it("should initialize organization with free org quota successfully", async () => {
      mockAutumn.setEntityBooleanFeature(owner.authId, organizationId, "can_create_org", true);
      mockAutumn.setEntityFeature(owner.authId, organizationId, "free_org", 1);

      await t.mutation(internal.organization.initializeOrganization, {
        organizationId,
        wrapperOrgKey,
        userId: owner.userId,
      });

      await t.run(async (ctx) => {
        const instance = await ctx.db
          .query("organizationSetting")
          .filter((q) => q.eq(q.field("organizationId"), organizationId))
          .first();

        if (instance) {
          expect(instance.organizationId).toBe(instance.organizationId);
          expect(instance.isFreeWithProPlan).toBeTruthy();
        }

        const user = await ctx.db.get(owner.userId);

        if (user) {
          expect(user.freeOrganizationUsed).toBeTruthy();
        }
      });
    });

    it("should initialize organization with org plan successfully", async () => {
      mockAutumn.setEntityBooleanFeature(owner.authId, organizationId, "can_create_org", true);
      mockAutumn.setEntityFeature(owner.authId, organizationId, "members", 10);
      mockAutumn.setEntityFeature(owner.authId, organizationId, "organization_projects", 10);

      await t.run(async (ctx) => {
        await ctx.db.patch(owner.userId, { freeOrganizationUsed: true });
      });

      await t.mutation(internal.organization.initializeOrganization, {
        organizationId,
        wrapperOrgKey,
        userId: owner.userId,
      });

      await t.run(async (ctx) => {
        const organizationSetting = await ctx.db
          .query("organizationSetting")
          .filter((q) => q.eq(q.field("organizationId"), organizationId))
          .first();

        expect(organizationSetting?.isFreeWithProPlan).toBeFalsy();
        expect(organizationSetting?.subscriptionStatus).toBe("active");
      });
    });
  });

  describe("should add member to org", () => {
    // this wrapped by the new member's public key, which is handled on client side
    const wrappedOrgKey = "wrapped-org-key";

    beforeEach(async () => {
      mockAutumn.setEntityFeature(owner.authId, organizationId, "free_org", 0);
      mockAutumn.setEntityBooleanFeature(owner.authId, organizationId, "can_create_org", true);
      mockAutumn.setEntityFeature(owner.authId, organizationId, "members", 10, 1);
      mockAutumn.setEntityFeature(owner.authId, organizationId, "organization_projects", 10);

      await t.mutation(internal.organization.initializeOrganization, {
        organizationId,
        wrapperOrgKey,
        userId: owner.userId,
      });
    });

    it("should add a member to the org successfully", async () => {
      await owner.asUser.mutation(api.organization.addMember, {
        organizationId,
        role: "admin",
        userEmail: member.email,
        wrappedOrgKey,
      });

      await t.run(async (ctx) => {
        const orgMember = await ctx.db
          .query("organizationMember")
          .filter((q) => q.eq(q.field("userId"), member.userId))
          .first();

        if (orgMember) {
          expect(orgMember.userId).toBe(member.userId);
        }

        const members = mockAutumn.getEntityFeature(owner.authId, organizationId, "members");

        // admin + new member = 2 members
        expect(members?.current).toBe(2);
      });
    });

    it("should not add member when the member limit reached", async () => {
      mockAutumn.setEntityFeature(owner.authId, organizationId, "members", 1, 1);

      await expect(
        owner.asUser.mutation(api.organization.addMember, {
          organizationId,
          role: "admin",
          userEmail: member.email,
          wrappedOrgKey,
        }),
      ).rejects.toThrow("Organization member limit reached");
    });
  });

  describe("removeMember", () => {
    // this wrapped by the new member's public key, which is handled on client side
    const wrappedOrgKey = "wrapped-org-key";

    let admin: TestUser;

    beforeEach(async () => {
      mockAutumn.setEntityFeature(owner.authId, organizationId, "free_org", 0);
      mockAutumn.setEntityBooleanFeature(owner.authId, organizationId, "can_create_org", true);
      mockAutumn.setEntityFeature(owner.authId, organizationId, "members", 10, 1);
      mockAutumn.setEntityFeature(owner.authId, organizationId, "organization_projects", 10);

      admin = testUsers.get("user4")!;

      await t.mutation(internal.organization.initializeOrganization, {
        organizationId,
        wrapperOrgKey,
        userId: owner.userId,
      });
    });

    it("should remove a member successfully", async () => {
      await owner.asUser.mutation(api.organization.addMember, {
        organizationId,
        role: "member",
        userEmail: member.email,
        wrappedOrgKey,
      });

      // remove the member
      await owner.asUser.mutation(api.organization.removeMember, {
        organizationId,
        reason: "removed",
        userId: member.userId,
      });

      await t.run(async (ctx) => {
        const membership = await ctx.db
          .query("organizationMember")
          .filter((q) => q.eq(q.field("userId"), member.userId))
          .first();

        expect(membership?.revokedAt).toBeDefined();
        expect(membership?.revocationReason).toBe("removed");

        const members = mockAutumn.getEntityFeature(owner.authId, organizationId, "members");

        expect(members?.current).toBe(1);
      });
    });

    it("should owner leave the org", async () => {
      await owner.asUser.mutation(api.organization.removeMember, {
        organizationId,
        reason: "left",
        userId: owner.userId,
      });

      await t.run(async (ctx) => {
        const membership = await ctx.db
          .query("organizationMember")
          .withIndex("by_org_and_user", (q) =>
            q.eq("organizationId", organizationId).eq("userId", owner.userId),
          )
          .first();

        const org = await ctx.db
          .query("organizationSetting")
          .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
          .first();

        expect(membership?.revocationReason).toBe("left");
        expect(membership?.revokedAt).toBeDefined();

        expect(org).toBeNull();
      });
    });

    it("should owner not leave if there is a project in the org", async () => {
      await owner.asUser.mutation(api.project.createOrganizationProject, {
        organizationId,
        name: "Organization Project",
        slug: "organization-project",
      });

      await expect(
        owner.asUser.mutation(api.organization.removeMember, {
          organizationId,
          reason: "left",
          userId: owner.userId,
        }),
      ).rejects.toThrow("Cannot delete organization with active projects");
    });

    it("should owner not leave if there is a member in the org", async () => {
      await owner.asUser.mutation(api.organization.addMember, {
        organizationId,
        role: "member",
        userEmail: member.email,
        wrappedOrgKey,
      });

      await expect(
        owner.asUser.mutation(api.organization.removeMember, {
          organizationId,
          reason: "left",
          userId: owner.userId,
        }),
      ).rejects.toThrow("As the organization owner, you cannot leave while other members exist");
    });
  });

  // NOTE: this function's only run by cron job
  describe("checkAllSubscriptionStatus", () => {
    let admin: TestUser;

    beforeEach(async () => {
      mockAutumn.setEntityFeature(owner.authId, organizationId, "free_org", 0);
      mockAutumn.setEntityBooleanFeature(owner.authId, organizationId, "can_create_org", true);
      mockAutumn.setEntityFeature(owner.authId, organizationId, "members", 10, 1);
      mockAutumn.setEntityFeature(owner.authId, organizationId, "organization_projects", 10, 0);

      admin = testUsers.get("user4")!;

      await t.run(async (ctx) => {
        await ctx.db.patch(owner.userId, { freeOrganizationUsed: true });
      });

      await t.mutation(internal.organization.initializeOrganization, {
        organizationId,
        wrapperOrgKey,
        userId: owner.userId,
      });
    });

    it("should set the org subscription status as payment_lapsed", async () => {
      mockAutumn.setEntityFeature(owner.authId, organizationId, "organization_projects", 0, 0);

      await t.mutation(internal.organization.checkAllSubscriptionStatus);

      await t.run(async (ctx) => {
        const orgSetting = await ctx.db
          .query("organizationSetting")
          .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
          .first();

        expect(orgSetting?.subscriptionStatus).toBe("payment_lapsed");
      });

      vi.useFakeTimers();

      // organizations have been suspended after 7 days
      vi.advanceTimersByTime(7 * 86_400_000);

      await t.mutation(internal.organization.checkAllSubscriptionStatus);

      await t.run(async (ctx) => {
        const orgSetting = await ctx.db
          .query("organizationSetting")
          .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
          .first();

        expect(orgSetting?.subscriptionStatus).toBe("suspended");
      });

      vi.useRealTimers();
    });
  });
});
