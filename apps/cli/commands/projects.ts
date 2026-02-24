import { validateSession } from "@repo/auth";
import { trackEvent } from "@repo/logger";
import ora from "ora";
import pc from "picocolors";
import { type Environment, type Folder, getApi, type ProjectListItem } from "../lib/api";

interface ProjectWithDetails extends ProjectListItem {
  isShared: boolean;
  environments: Array<Environment & { folders: Folder[] }>;
}

const TREE = {
  BRANCH: "├── ",
  LAST_BRANCH: "└── ",
  VERTICAL: "│   ",
  EMPTY: "    ",
} as const;

function renderProjectTree(projects: ProjectWithDetails[]): void {
  if (projects.length === 0) {
    console.log(pc.dim("No projects found"));
    console.log(pc.dim("Create one at app.relic.so"));
    return;
  }

  console.log(pc.bold("Your Projects"));
  console.log();

  for (let projectIndex = 0; projectIndex < projects.length; projectIndex++) {
    const project = projects[projectIndex];
    const isLastProject = projectIndex === projects.length - 1;
    const projectPrefix = isLastProject ? TREE.LAST_BRANCH : TREE.BRANCH;
    const childPrefix = isLastProject ? TREE.EMPTY : TREE.VERTICAL;

    const badges: string[] = [];
    if (project.isShared) badges.push("shared");
    if (project.isArchived) badges.push("archived");
    const badgeText = badges.length > 0 ? pc.dim(` (${badges.join(", ")})`) : "";

    const projectName = project.isArchived ? pc.dim(project.name) : pc.bold(project.name);

    console.log(`${pc.dim(projectPrefix)}${projectName}${badgeText}`);

    for (let envIndex = 0; envIndex < project.environments.length; envIndex++) {
      const env = project.environments[envIndex];
      const isLastEnv = envIndex === project.environments.length - 1;
      const envPrefix = isLastEnv ? TREE.LAST_BRANCH : TREE.BRANCH;
      const envChildPrefix = isLastEnv ? TREE.EMPTY : TREE.VERTICAL;

      const envColor = env.color || "white";
      const colorFn =
        envColor in pc ? (pc as Record<string, (s: string) => string>)[envColor] : (s: string) => s;
      console.log(`${pc.dim(childPrefix)}${pc.dim(envPrefix)}${colorFn(env.name)}`);

      for (let folderIndex = 0; folderIndex < env.folders.length; folderIndex++) {
        const folder = env.folders[folderIndex];
        const isLastFolder = folderIndex === env.folders.length - 1;
        const folderPrefix = isLastFolder ? TREE.LAST_BRANCH : TREE.BRANCH;

        console.log(
          `${pc.dim(childPrefix)}${pc.dim(envChildPrefix)}${pc.dim(folderPrefix)}${pc.dim(`${folder.name}/`)}`,
        );
      }
    }
  }
}

export default async function projects() {
  const spinner = ora("Connecting...").start();

  try {
    const sessionValidation = await validateSession();
    if (!sessionValidation.isValid || sessionValidation.isExpired) {
      spinner.stop();
      console.log(pc.yellow("Not logged in"));
      console.log(pc.dim("Run `relic login` to authenticate"));
      return;
    }

    const api = getApi();

    spinner.text = "Fetching projects...";
    const [ownedProjects, sharedProjects] = await Promise.all([
      api.listProjects(),
      api.listSharedProjects(),
    ]);

    const allProjects: ProjectWithDetails[] = [
      ...ownedProjects.map((p) => ({
        ...p,
        isShared: false,
        environments: [] as Array<Environment & { folders: Folder[] }>,
      })),
      ...sharedProjects.map((p) => ({
        ...p,
        isShared: true,
        environments: [] as Array<Environment & { folders: Folder[] }>,
      })),
    ];

    spinner.text = "Fetching environments...";
    const projectsWithEnvs = await Promise.all(
      allProjects.map(async (project) => {
        try {
          const environments = await api.getProjectEnvironments(project.id);
          return {
            ...project,
            environments: environments.map((e) => ({ ...e, folders: [] as Folder[] })),
          };
        } catch {
          return { ...project, environments: [] };
        }
      }),
    );

    spinner.text = "Fetching folders...";
    const projectsWithFolders = await Promise.all(
      projectsWithEnvs.map(async (project) => {
        const environmentsWithFolders = await Promise.all(
          project.environments.map(async (env) => {
            try {
              const data = await api.getEnvironmentData(env.id);
              return { ...env, folders: data.folders };
            } catch {
              return { ...env, folders: [] };
            }
          }),
        );
        return { ...project, environments: environmentsWithFolders };
      }),
    );

    trackEvent("cli_command_executed", { command: "projects", count: projectsWithFolders.length });
    spinner.stop();
    renderProjectTree(projectsWithFolders);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch projects";
    // Handle auth-related errors more gracefully
    if (
      message.includes("Not authenticated") ||
      message.includes("JWT") ||
      message.includes("token")
    ) {
      spinner.stop();
      console.log(pc.yellow("Not logged in"));
      console.log(pc.dim("Run `relic login` to authenticate"));
      return;
    }
    spinner.fail(pc.red(`Error: ${message}`));
    process.exit(1);
  }
}
