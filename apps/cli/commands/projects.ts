import { trackEvent } from "@repo/logger";
import ora from "ora";
import pc from "picocolors";
import { getApi } from "../lib/api";
import {
  getErrorMessage,
  hasActiveSession,
  isAuthError,
  NOT_LOGGED_IN_MESSAGE,
  printNotLoggedIn,
} from "../lib/cli";
import { printJson, printJsonError } from "../lib/json";
import { loadProjectTree, type ProjectWithDetails } from "../lib/projects";
import { exitWithTelemetry } from "../lib/telemetry";

const TREE = {
  BRANCH: "├── ",
  LAST_BRANCH: "└── ",
  VERTICAL: "│   ",
  EMPTY: "    ",
} as const;

function renderProjectTree(projects: ProjectWithDetails[]): void {
  if (projects.length === 0) {
    console.log(pc.dim("No projects found"));
    console.log(pc.dim("Run `relic` to open the TUI and create a project"));
    return;
  }

  console.log(pc.bold("Your Projects"));
  console.log();

  for (let projectIndex = 0; projectIndex < projects.length; projectIndex++) {
    const project = projects[projectIndex]!;
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
      const env = project.environments[envIndex]!;
      const isLastEnv = envIndex === project.environments.length - 1;
      const envPrefix = isLastEnv ? TREE.LAST_BRANCH : TREE.BRANCH;
      const envChildPrefix = isLastEnv ? TREE.EMPTY : TREE.VERTICAL;

      const envColor = env.color || "white";
      const colorFn =
        envColor in pc
          ? (pc as unknown as Record<string, (s: string) => string>)[envColor]!
          : (s: string) => s;
      console.log(`${pc.dim(childPrefix)}${pc.dim(envPrefix)}${colorFn(env.name)}`);

      for (let folderIndex = 0; folderIndex < env.folders.length; folderIndex++) {
        const folder = env.folders[folderIndex]!;
        const isLastFolder = folderIndex === env.folders.length - 1;
        const folderPrefix = isLastFolder ? TREE.LAST_BRANCH : TREE.BRANCH;

        console.log(
          `${pc.dim(childPrefix)}${pc.dim(envChildPrefix)}${pc.dim(folderPrefix)}${pc.dim(`${folder.name}/`)}`,
        );
      }
    }
  }
}

export interface ProjectsOptions {
  json?: boolean;
  project?: string;
}

export function toProjectsJson(projects: ProjectWithDetails[]) {
  return projects.map((project) => ({
    id: project.id,
    name: project.name,
    slug: project.slug,
    isShared: project.isShared,
    isArchived: project.isArchived,
    environments: project.environments.map((env) => ({
      id: env.id,
      name: env.name,
      color: env.color ?? null,
      folders: env.folders.map((folder) => ({ id: folder.id, name: folder.name })),
    })),
  }));
}

export default async function projects(options: ProjectsOptions = {}) {
  const json = !!options.json;
  const spinner = json ? null : ora("Connecting...").start();

  const notLoggedIn = async (): Promise<never> => {
    if (json) {
      printJsonError("not_logged_in", NOT_LOGGED_IN_MESSAGE);
    } else {
      spinner?.stop();
      printNotLoggedIn();
    }
    return exitWithTelemetry(1);
  };

  try {
    if (!(await hasActiveSession())) {
      await notLoggedIn();
    }

    if (spinner) spinner.text = "Fetching projects...";
    const projectTree = await loadProjectTree(
      getApi(),
      (stage) => {
        if (spinner) {
          spinner.text =
            stage === "environments" ? "Fetching environments..." : "Fetching folders...";
        }
      },
      options.project,
    );

    trackEvent("cli_command_executed", { command: "projects", count: projectTree.length, json });
    spinner?.stop();

    if (json) {
      if (options.project && projectTree.length === 0) {
        printJsonError("project_not_found", `Project "${options.project}" not found`);
        return exitWithTelemetry(1);
      }
      printJson(toProjectsJson(projectTree));
      return;
    }
    renderProjectTree(projectTree);
  } catch (err) {
    if (isAuthError(err)) {
      return notLoggedIn();
    }
    const message = getErrorMessage(err, "Failed to fetch projects");
    if (json) {
      printJsonError("failed", message);
    } else {
      spinner?.fail(pc.red(`Error: ${message}`));
    }
    await exitWithTelemetry(1);
  }
}
