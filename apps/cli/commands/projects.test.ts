import { describe, expect, test } from "bun:test";
import type { ProjectListItem } from "../lib/api";
import { loadProjectTree } from "../lib/projects";
import { toProjectsJson } from "./projects";

function project(id: string, name: string): ProjectListItem {
  return {
    id,
    name,
    slug: name.toLowerCase(),
    status: "owned",
    isRestricted: false,
    isArchived: false,
    createdAt: 0,
    updatedAt: 0,
  };
}

const fakeApi = {
  listProjects: async () => [project("proj_1", "Api")],
  listSharedProjects: async () => [project("proj_2", "Shared")],
  getProjectEnvironments: async (projectId: string) => [
    { id: `${projectId}_dev`, name: "development", projectId, color: "green" },
  ],
  getEnvironmentData: async (environmentId: string) => ({
    folders: [{ id: `${environmentId}_db`, name: "database", environmentId }],
    secrets: [
      {
        id: "s1",
        key: "DATABASE_URL",
        encryptedValue: "ciphertext",
        environmentId,
        valueType: "string" as const,
        scope: "server" as const,
      },
    ],
  }),
};

describe("loadProjectTree", () => {
  test("loads owned and shared projects with environments and folders", async () => {
    const projects = await loadProjectTree(fakeApi);
    expect(projects.map((p) => [p.id, p.isShared])).toEqual([
      ["proj_1", false],
      ["proj_2", true],
    ]);
    expect(projects[0]?.environments[0]?.folders[0]?.name).toBe("database");
  });

  test("filters to a single project", async () => {
    const projects = await loadProjectTree(fakeApi, undefined, "proj_2");
    expect(projects.map((p) => p.id)).toEqual(["proj_2"]);
  });
});

describe("toProjectsJson", () => {
  test("exposes structure only, never secrets", async () => {
    const json = toProjectsJson(await loadProjectTree(fakeApi, undefined, "proj_1"));
    expect(json).toEqual([
      {
        id: "proj_1",
        name: "Api",
        slug: "api",
        isShared: false,
        isArchived: false,
        environments: [
          {
            id: "proj_1_dev",
            name: "development",
            color: "green",
            folders: [{ id: "proj_1_dev_db", name: "database" }],
          },
        ],
      },
    ]);
    expect(JSON.stringify(json)).not.toContain("ciphertext");
    expect(JSON.stringify(json)).not.toContain("DATABASE_URL");
  });
});
