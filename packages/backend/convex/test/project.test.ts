import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { createMockAutumn } from "./helpers/autumn.mock";
import { getTestUsers, type TestUser } from "./helpers/setup";

const modules = import.meta.glob("../**/*.ts");

// NOTE: error messages are not fully written, only the beginnings are shown
const mockAutumn = createMockAutumn(async (ctx) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return { customerId: identity.subject };
});

vi.mock("../autumn", () => ({
  autumn: mockAutumn,
}));

describe("project.ts", () => {
  let t: TestConvex<typeof schema>;
  let testUsers: Map<string, TestUser> = new Map();

  beforeEach(async () => {
    t = convexTest(schema, modules);

    testUsers = await getTestUsers(t);
  });

  afterEach(() => {
    mockAutumn.reset();
  });

  describe("createPersonalProject", () => {
    it("should create project when user has not exceeded limit", async () => {
      const { authId, userId, asUser } = testUsers.get("user1")!;

      mockAutumn.setFeature(authId, "personal_projects", 2, 0);

      const result = await asUser.mutation(api.project.createPersonalProject, {
        name: "My Project",
        slug: "my-project",
      });

      expect(result.success).toBe(true);
      expect(result.projectId).toBeDefined();

      const project = await t.run(async (ctx) => {
        return await ctx.db.get(result.projectId as Id<"project">);
      });

      expect(project).toBeDefined();
      expect(project?.name).toBe("My Project");
      expect(project?.slug).toBe("my-project");
      expect(project?.ownerType).toBe("user");
      expect(project?.ownerId).toBe(userId);
      expect(project?.createdBy).toBe(userId);

      const usage = mockAutumn.getUserFeature("user1", "personal_projects");
      expect(usage?.current).toBe(1);
    });

    it("should not create project when no autumn data exists", async () => {
      const { asUser } = testUsers.get("user1")!;

      await expect(
        asUser.mutation(api.project.createPersonalProject, {
          name: "My Project",
          slug: "my-project",
        }),
      ).rejects.toThrow("Failed to check subscription:");
    });

    it("should not create project when user has exceeded limit", async () => {
      const { authId, asUser } = testUsers.get("user1")!;

      mockAutumn.setFeature(authId, "personal_projects", 2, 0);

      await Promise.all([
        asUser.mutation(api.project.createPersonalProject, {
          name: "My Project 1",
          slug: "my-project-1",
        }),
        asUser.mutation(api.project.createPersonalProject, {
          name: "My Project 2",
          slug: "my-project-2",
        }),
      ]);

      await expect(
        asUser.mutation(api.project.createPersonalProject, {
          name: "My Project 3",
          slug: "my-project-3",
        }),
      ).rejects.toThrow(
        "Project limit reached. You currently have 2 projects. Purchase additional projects or upgrade your plan",
      );
    });

    it("should not create project when the same slug exists", async () => {
      const { authId, asUser } = testUsers.get("user1")!;

      mockAutumn.setFeature(authId, "personal_projects", 2, 0);

      await asUser.mutation(api.project.createPersonalProject, {
        name: "My Project 1",
        slug: "my-project-1",
      });

      await expect(
        asUser.mutation(api.project.createPersonalProject, {
          name: "My Project 2",
          slug: "my-project-1", // same slug as in the previous save
        }),
      ).rejects.toThrow("A project with this slug already exists");
    });
  });

  describe("createOrganizationProject", () => {
    let owner: TestUser;
    let member: TestUser;

    const organizationId = "org-id";
    const wrapperOrgKey = "org-key";

    beforeAll(() => {
      owner = testUsers.get("user1")!;
      member = testUsers.get("user2")!;
    });

    beforeEach(async () => {
      await member.asUser.mutation(api.userKey.storeUserKey, {
        encryptedPrivateKey: "member-encrypted-private-key",
        publicKey: "member-public-key",
        salt: "member-salt",
      });

      mockAutumn.setBooleanFeature(owner.authId, "can_create_org", true);
      mockAutumn.setFeature(owner.authId, "free_org", 1);
      mockAutumn.setEntityFeature(owner.authId, organizationId, "organization_projects", 10);
      mockAutumn.setEntityFeature(owner.authId, organizationId, "members", 10);

      await owner.asUser.mutation(api.organization.initializeOrganization, {
        organizationId,
        wrapperOrgKey,
      });
    });

    it("should create project successfully", async () => {
      const { projectId } = await owner.asUser.mutation(api.project.createOrganizationProject, {
        organizationId,
        name: "My Organization Project",
        slug: "my-organization-project",
      });

      const { ownerType, ownerId, name, slug } = await owner.asUser.query(api.project.getProject, {
        projectId,
      });

      expect(ownerType).toBe("organization");
      expect(ownerId).toBe(organizationId);
      expect(name).toBe("My Organization Project");
      expect(slug).toBe("my-organization-project");
    });

    it("should not create org project if the creator is not either owner or admin", async () => {
      mockAutumn.setEntityFeature(owner.authId, organizationId, "organization_projects", 10);

      await owner.asUser.mutation(api.organization.addMember, {
        organizationId,
        role: "member",
        userEmail: member.email,
        wrappedOrgKey: "wrapped-org-key",
      });

      await expect(
        member.asUser.mutation(api.project.createOrganizationProject, {
          organizationId,
          name: "Member Org Projects",
          slug: "member-org-project",
        }),
      ).rejects.toThrow("Only organization owners and admins can create projects");
    });

    it("should not create org project if there is something wrong in autumn's organization_projects", async () => {
      mockAutumn.reset();

      await expect(
        owner.asUser.mutation(api.project.createOrganizationProject, {
          organizationId,
          name: "My Organization Project",
          slug: "my-organization-project",
        }),
      ).rejects.toThrow("Failed to check organization subscription");
    });

    it("should not create org project if there are no organization_projects left", async () => {
      mockAutumn.setEntityFeature(owner.authId, organizationId, "organization_projects", 1);

      await owner.asUser.mutation(api.project.createOrganizationProject, {
        organizationId,
        name: "My Organization Project 1",
        slug: "my-organization-project-1",
      });

      await expect(
        owner.asUser.mutation(api.project.createOrganizationProject, {
          organizationId,
          name: "My Organization Project 2",
          slug: "my-organization-project-2",
        }),
      ).rejects.toThrow("Organization project limit reached.");
    });

    it("should not create org project if there is a project with the same slug exists", async () => {
      await owner.asUser.mutation(api.project.createOrganizationProject, {
        organizationId,
        name: "My Organization Project",
        slug: "my-organization-project",
      });

      await expect(
        owner.asUser.mutation(api.project.createOrganizationProject, {
          organizationId,
          name: "My Organization Project 1",
          slug: "my-organization-project",
        }),
      ).rejects.toThrow("A project with this slug already exists in this organization");
    });
  });

  describe("listUserProjects", () => {
    let owner: TestUser;

    beforeAll(() => {
      owner = testUsers.get("user1")!;
    });

    beforeEach(async () => {
      mockAutumn.setBooleanFeature(owner.authId, "can_create_org", true);
      mockAutumn.setFeature(owner.authId, "free_org", 1);
    });

    it("should list projects of ctx user successfully", async () => {
      mockAutumn.setFeature(owner.authId, "personal_projects", 10);

      const slugs = ["project-1", "project-2", "project-3", "project-4", "project-5"];

      for (const slug of slugs) {
        await owner.asUser.mutation(api.project.createPersonalProject, {
          name: slug.toUpperCase(),
          slug,
        });
      }

      let projects = await owner.asUser.query(api.project.listUserProjects, {});
      expect(projects.projects.filter((p) => p.isRestricted === false).length).toBe(5);

      // downgrading free plan
      mockAutumn.setFeature(owner.authId, "personal_projects", 2);
      projects = await owner.asUser.query(api.project.listUserProjects, {});
      expect(projects.projects.filter((p) => p.isRestricted === false).length).toBe(2);
    });
  });

  describe("listOrganizationProjects", () => {
    let owner: TestUser;
    let not_member: TestUser;

    const organizationId = "org-id";
    const wrapperOrgKey = "org-key";

    beforeAll(() => {
      owner = testUsers.get("user1")!;
      not_member = testUsers.get("user3")!;
    });

    beforeEach(async () => {
      mockAutumn.setBooleanFeature(owner.authId, "can_create_org", true);
      mockAutumn.setFeature(owner.authId, "free_org", 1);
      mockAutumn.setEntityFeature(owner.authId, organizationId, "organization_projects", 10);
      mockAutumn.setEntityFeature(owner.authId, organizationId, "members", 10);

      await owner.asUser.mutation(api.organization.initializeOrganization, {
        organizationId,
        wrapperOrgKey,
      });
    });

    it("should not list organization projects if the org has been suspended", async () => {
      await owner.asUser.mutation(api.project.createOrganizationProject, {
        organizationId,
        name: "Org Project",
        slug: "org-project",
      });

      // make sure that org's inactive
      mockAutumn.setEntityFeature(owner.authId, organizationId, "organization_projects", 0);

      // suspend the org
      await t.run(async (ctx) => {
        const orgSetting = await ctx.db
          .query("organizationSetting")
          .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
          .first();

        if (orgSetting) {
          const suspendedAt = Date.now();
          await ctx.db.patch(orgSetting._id, {
            isFreeWithProPlan: false,
            suspendedAt,
            subscriptionStatus: "suspended",
          });
        }
      });

      await expect(
        owner.asUser.query(api.project.listOrganizationProjects, {
          organizationId,
        }),
      ).rejects.toThrow("Organization is suspended. Please update");
    });

    it("should not list org projects if user is not a member of the org", async () => {
      await expect(
        not_member.asUser.query(api.project.listOrganizationProjects, {
          organizationId,
        }),
      ).rejects.toThrow("You are not a member of this organization");
    });
  });

  describe("getProject", () => {
    let owner: TestUser;
    let random_user: TestUser;

    let personalProjectId: Id<"project">;
    let orgProjectId: Id<"project">;

    const organizationId = "org-id";
    const wrapperOrgKey = "org-key";

    beforeAll(() => {
      owner = testUsers.get("user1")!;
      random_user = testUsers.get("user2")!;
    });

    beforeEach(async () => {
      mockAutumn.setBooleanFeature(owner.authId, "can_create_org", true);
      mockAutumn.setFeature(owner.authId, "personal_projects", 2);
      mockAutumn.setFeature(owner.authId, "free_org", 1);
      mockAutumn.setEntityFeature(owner.authId, organizationId, "organization_projects", 10);
      mockAutumn.setEntityFeature(owner.authId, organizationId, "members", 10);

      await owner.asUser.mutation(api.organization.initializeOrganization, {
        organizationId,
        wrapperOrgKey,
      });

      let result = await owner.asUser.mutation(api.project.createPersonalProject, {
        name: "Personal Project",
        slug: "personal-project",
      });
      personalProjectId = result.projectId;

      result = await owner.asUser.mutation(api.project.createOrganizationProject, {
        name: "Org Project",
        slug: "org-project",
        organizationId,
      });
      orgProjectId = result.projectId;
    });

    it("should retrieve the project successfully", async () => {
      let result = await owner.asUser.query(api.project.getProject, {
        projectId: personalProjectId,
      });

      expect(result.name).toBe("Personal Project");
      expect(result.slug).toBe("personal-project");
      expect(result.ownerId).toBe(owner.userId);

      result = await owner.asUser.query(api.project.getProject, { projectId: orgProjectId });

      expect(result.name).toBe("Org Project");
      expect(result.slug).toBe("org-project");
      expect(result.ownerId).toBe(organizationId);
    });

    it("should return an error if the project does not exist", async () => {
      await t.run(async (ctx) => {
        await ctx.db.delete(personalProjectId);
      });

      await expect(
        owner.asUser.query(api.project.getProject, {
          projectId: personalProjectId,
        }),
      ).rejects.toThrow("Project not found");
    });

    it("should return an error if the organization is suspended", async () => {
      // make sure that org's inactive
      mockAutumn.setEntityFeature(owner.authId, organizationId, "organization_projects", 0);

      // suspend the org
      await t.run(async (ctx) => {
        const orgSetting = await ctx.db
          .query("organizationSetting")
          .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
          .first();

        if (orgSetting) {
          const suspendedAt = Date.now();
          await ctx.db.patch(orgSetting._id, {
            isFreeWithProPlan: false,
            suspendedAt,
            subscriptionStatus: "suspended",
          });
        }
      });

      await expect(
        owner.asUser.query(api.project.getProject, {
          projectId: orgProjectId,
        }),
      ).rejects.toThrow("Organization is suspended.");
    });

    it("should return an error if the user does not have access to the project", async () => {
      await expect(
        random_user.asUser.query(api.project.getProject, { projectId: personalProjectId }),
      ).rejects.toThrow("You do not have access to this project");
      await expect(
        random_user.asUser.query(api.project.getProject, { projectId: orgProjectId }),
      ).rejects.toThrow("You do not have access to this project");
    });

    it("should return an error if the project is restricted", async () => {
      const { projectId } = await owner.asUser.mutation(api.project.createPersonalProject, {
        name: "Personal Project 2",
        slug: "personal-project-2",
      });

      mockAutumn.setFeature(owner.authId, "personal_projects", 1);

      const mockDate = new Date("1998-03-21T00:00:00Z").getTime();

      await t.run(async (ctx) => {
        await ctx.db.patch(owner.userId, { planDowngradedAt: mockDate });
      });

      await expect(owner.asUser.query(api.project.getProject, { projectId })).rejects.toThrow(
        "This project is restricted.",
      );
    });
  });

  describe("updateProject", () => {
    let owner: TestUser;
    let nonOwner: TestUser;

    let personalProjectId: Id<"project">;

    beforeAll(() => {
      owner = testUsers.get("user1")!;
      nonOwner = testUsers.get("user2");
    });

    beforeEach(async () => {
      mockAutumn.setFeature(owner.authId, "personal_projects", 2);

      const result = await owner.asUser.mutation(api.project.createPersonalProject, {
        name: "Personal Project",
        slug: "personal-project",
      });
      personalProjectId = result.projectId;
    });

    it("should update the project successfully", async () => {
      const newProjectName = "Personal Project - UPDATED";
      await owner.asUser.mutation(api.project.updateProject, {
        projectId: personalProjectId,
        name: newProjectName,
      });

      await t.run(async (ctx) => {
        const project = await ctx.db.get(personalProjectId);

        expect(project!.name).toBe(newProjectName);
      });
    });

    // NOTE: i didn't add the org project bad scenarios - these are only for personal projects
    it("should return an error if the project is archived", async () => {
      await t.run(async (ctx) => {
        await ctx.db.patch(personalProjectId, {
          isArchived: true,
        });
      });

      await expect(
        owner.asUser.mutation(api.project.updateProject, {
          projectId: personalProjectId,
          name: "Personal Project - UPDATED",
        }),
      ).rejects.toThrow("Cannot update archived project.");
    });

    it("should return an error if a non-admin user wants to update project", async () => {
      await expect(
        nonOwner.asUser.mutation(api.project.updateProject, {
          projectId: personalProjectId,
          name: "Personal Project - UPDATED",
        }),
      ).rejects.toThrow("You do not have permission to update this project");
    });

    it("should return an error if the project is restricted", async () => {
      const { projectId } = await owner.asUser.mutation(api.project.createPersonalProject, {
        name: "Personal Project 2",
        slug: "personal-project-2",
      });

      mockAutumn.setFeature(owner.authId, "personal_projects", -1);

      const mockDate = new Date("1998-03-21T00:00:00Z").getTime();

      await t.run(async (ctx) => {
        await ctx.db.patch(owner.userId, { planDowngradedAt: mockDate });
      });

      await expect(owner.asUser.mutation(api.project.updateProject, { projectId })).rejects.toThrow(
        "This project is restricted.",
      );
    });
  });

  describe("archive and unarchive project", () => {
    let owner: TestUser;
    let nonOwner: TestUser;

    let personalProjectId: Id<"project">;

    beforeAll(() => {
      owner = testUsers.get("user1")!;
      nonOwner = testUsers.get("user2");
    });

    beforeEach(async () => {
      mockAutumn.setFeature(owner.authId, "personal_projects", 2);

      const result = await owner.asUser.mutation(api.project.createPersonalProject, {
        name: "Personal Project",
        slug: "personal-project",
      });
      personalProjectId = result.projectId;
    });

    describe("archiveProject", () => {
      it("should archive project successfully", async () => {
        const beforeArchive = mockAutumn.getUserFeature(owner.authId, "personal_projects");

        expect(beforeArchive?.current).toBe(1);

        await owner.asUser.mutation(api.project.archiveProject, { projectId: personalProjectId });

        const afterArchive = mockAutumn.getUserFeature(owner.authId, "personal_projects");

        expect(afterArchive?.current).toBe(0);
      });
    });

    describe("unarchiveProject", () => {
      it("should unarchive project project successfully", async () => {
        await owner.asUser.mutation(api.project.archiveProject, { projectId: personalProjectId });

        await owner.asUser.mutation(api.project.unarchiveProject, { projectId: personalProjectId });

        const afterUnarchive = mockAutumn.getUserFeature(owner.authId, "personal_projects");

        expect(afterUnarchive?.current).toBe(1);
      });

      it("should not unarchive project if there is no personal_projects limit left", async () => {
        mockAutumn.setFeature(owner.authId, "personal_projects", 3);

        await owner.asUser.mutation(api.project.createPersonalProject, {
          name: "Personal Project 2",
          slug: "personal-project-2",
        });

        await owner.asUser.mutation(api.project.createPersonalProject, {
          name: "Personal Project 3",
          slug: "personal-project-3",
        });

        await owner.asUser.mutation(api.project.archiveProject, { projectId: personalProjectId });

        mockAutumn.setFeature(owner.authId, "personal_projects", 2, 2);

        const a = mockAutumn.getUserFeature(owner.authId, "personal_projects");
        console.log("personal_projects", a);

        await expect(
          owner.asUser.mutation(api.project.unarchiveProject, { projectId: personalProjectId }),
        ).rejects.toThrow("Project limit reached");
      });
    });
  });
});
