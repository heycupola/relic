import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
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

// NOTE: Only the beginnings of error messages are shown; full messages are truncated
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

describe("environment.ts", () => {
  let t: TestConvex<typeof schema>;
  let testUsers: Map<string, TestUser> = new Map();
  let owner: TestUser;
  let member: TestUser;
  let non_member: TestUser;

  let personalProjectId: Id<"project">;
  let organizationProjectId: Id<"project">;

  const environmentSlugs = Array.from({ length: 9 }, (_, i) => `env-${i + 1}`);

  beforeEach(async () => {
    t = convexTest(schema, modules);

    testUsers = await getTestUsers(t);
    owner = testUsers.get("user1")!;
    member = testUsers.get("user2")!;
    non_member = testUsers.get("user3")!;

    const organizationId = "org-id";
    const wrapperOrgKey = "org-key";

    mockAutumn.setEntityFeature(owner.authId, organizationId, "free_org", 1);
    mockAutumn.setEntityBooleanFeature(owner.authId, organizationId, "can_create_org", true);
    mockAutumn.setEntityFeature(owner.authId, organizationId, "members", 10);
    mockAutumn.setEntityFeature(owner.authId, organizationId, "organization_projects", 10);

    mockAutumn.setFeature(owner.authId, "personal_projects", 2);

    await t.mutation(internal.organization.initializeOrganization, {
      organizationId,
      wrapperOrgKey,
      userId: owner.userId,
    });

    const organizationProject = await owner.asUser.mutation(api.project.createOrganizationProject, {
      name: "Organization Project",
      slug: "organization-project",
      organizationId,
    });
    organizationProjectId = organizationProject.projectId;

    const personalProject = await owner.asUser.mutation(api.project.createPersonalProject, {
      name: "Personal Project",
      slug: "personal-project",
    });
    personalProjectId = personalProject.projectId;
  });

  afterEach(() => {
    mockAutumn.reset();
  });

  describe("createEnvironment", () => {
    it("should create environment successfully", async () => {
      const result1 = await owner.asUser.mutation(api.environment.createEnvironment, {
        name: "Personal Production",
        slug: "personal-production",
        color: "ffffff",
        projectId: personalProjectId,
      });

      expect(result1.success).toBeTruthy();

      const result2 = await owner.asUser.mutation(api.environment.createEnvironment, {
        name: "Org Production",
        slug: "org-production",
        color: "ffffff",
        projectId: organizationProjectId,
      });

      expect(result2.success).toBeTruthy();
    });

    it("should return error when the max environment count has reached", async () => {
      const MAX_ENV_COUNT = 32;

      const slugs = Array.from({ length: MAX_ENV_COUNT }, (_, i) => `env-${i + 1}`);

      for (const slug of slugs) {
        await owner.asUser.mutation(api.environment.createEnvironment, {
          name: slug.toUpperCase(),
          projectId: personalProjectId,
          slug,
          color: "ffffff",
        });
      }

      await expect(
        owner.asUser.mutation(api.environment.createEnvironment, {
          name: "Test Environment 2",
          projectId: personalProjectId,
          slug: "this-is-a-slug-2",
          color: "ffffff",
        }),
      ).rejects.toThrow("You've reached the maximum number of environments");
    });
  });

  describe("listEnvironments", () => {
    it("should list environments successfully", async () => {
      for (const slug of environmentSlugs) {
        await owner.asUser.mutation(api.environment.createEnvironment, {
          name: slug.toUpperCase(),
          projectId: personalProjectId,
          slug,
          color: "ffffff",
        });
      }

      const result = await owner.asUser.query(api.environment.listEnvironments, {
        projectId: personalProjectId,
      });

      expect(result.length).toBe(9);
      expect(result[0]!.slug).toBe(environmentSlugs[0]);
      expect(result[8]!.slug).toBe(environmentSlugs[8]);
    });
  });

  describe("getEnvironment", () => {
    it("should get environment successfully", async () => {
      const result = await Promise.all(
        environmentSlugs.map(async (slug) => {
          const { environmentId } = await owner.asUser.mutation(api.environment.createEnvironment, {
            name: slug.toUpperCase(),
            projectId: personalProjectId,
            slug,
          });

          return owner.asUser.query(api.environment.getEnvironment, { environmentId });
        }),
      );

      expect(result.length).toBe(9);
      expect(result[0]!.slug).toBe(environmentSlugs[0]);
      expect(result[8]!.slug).toBe(environmentSlugs[8]);
    });
  });

  describe("updateEnvironment", () => {
    it("should update environment successfully", async () => {
      const { environmentId } = await owner.asUser.mutation(api.environment.createEnvironment, {
        name: "Production",
        slug: "production",
        projectId: personalProjectId,
        color: "ffffff",
      });

      const newName = "Production UPDATED";

      await owner.asUser.mutation(api.environment.updateEnvironment, {
        environmentId,
        name: newName,
      });

      const result = await owner.asUser.query(api.environment.getEnvironment, {
        environmentId,
      });

      expect(result.name).toBe(newName);
    });
  });

  describe("deleteEnvironment", () => {
    it("should delete environment successfully", async () => {
      const { environmentId } = await owner.asUser.mutation(api.environment.createEnvironment, {
        name: "Production",
        slug: "production",
        projectId: personalProjectId,
        color: "ffffff",
      });

      await t.run(async (ctx) => {
        const environment = await ctx.db.get(environmentId);

        expect(environment!.name).toBe("Production");
      });

      await owner.asUser.mutation(api.environment.deleteEnvironment, { environmentId });

      await t.run(async (ctx) => {
        const environment = await ctx.db.get(environmentId);

        expect(environment).toBeNull();
      });
    });
  });

  describe("reorderEnvironments", () => {
    it("should reorder environments successfully", async () => {
      const { environmentId: id1 } = await owner.asUser.mutation(
        api.environment.createEnvironment,
        {
          name: "name-1",
          slug: "slug-1",
          projectId: personalProjectId,
          color: "ffffff",
        },
      );

      const { environmentId: id2 } = await owner.asUser.mutation(
        api.environment.createEnvironment,
        {
          name: "name-2",
          slug: "slug-2",
          projectId: personalProjectId,
          color: "ffffff",
        },
      );

      await owner.asUser.mutation(api.environment.reorderEnvironments, {
        environmentIds: [id2, id1],
        projectId: personalProjectId,
      });

      await t.run(async (ctx) => {
        const project1 = await ctx.db.get(id1);
        const project2 = await ctx.db.get(id2);

        expect(project1?.sortOrder).toBe(1);
        expect(project2?.sortOrder).toBe(0);
      });
    });
  });

  describe("getEnvironmentData", () => {
    it("should retrieve environment data successfully", async () => {
      const { environmentId } = await owner.asUser.mutation(api.environment.createEnvironment, {
        name: "Production",
        slug: "production",
        projectId: personalProjectId,
        color: "ffffff",
      });

      const { folderId } = await owner.asUser.mutation(api.folder.createFolder, {
        environmentId,
        name: "backend",
        slug: "backend",
      });

      await owner.asUser.mutation(api.secret.createSecret, {
        key: "API_KEY",
        folderId,
        encryptedValue: "api-key-encrypted-value",
        primitiveType: "string",
        encryptionKeyVersion: 1,
        environmentId,
        description: "This is an API key.",
        tags: ["API_KEY", "secret"],
      });

      await owner.asUser.mutation(api.secret.createSecret, {
        key: "DB_URI",
        encryptedValue: "db-uri-encrypted-value",
        primitiveType: "string",
        encryptionKeyVersion: 1,
        environmentId,
        description: "This is an DB uri.",
        tags: ["DB_URI", "secret"],
      });

      const result = await owner.asUser.query(api.environment.getEnvironmentData, {
        environmentId,
        includeDeleted: true,
        includeRecentActivity: true,
      });

      expect(result.folders.length).toBe(1);
      expect(result.folders[0]!.secrets.length).toBe(1);
      expect(result.folders[0]!.secrets[0]!.key).toBe("API_KEY");

      expect(result.environment.slug).toBe("production");

      expect(result.rootSecrets.length).toBe(1);
      expect(result.rootSecrets[0]!.key).toBe("DB_URI");
    });
  });
});
