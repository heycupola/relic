import { trackEvent } from "@repo/logger";
import ora from "ora";
import pc from "picocolors";
import { getApi } from "../lib/api";
import { getErrorMessage, hasActiveSession, isAuthError, printNotLoggedIn } from "../lib/cli";
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

export default async function projects() {
  const spinner = ora("Connecting...").start();

  try {
    if (!(await hasActiveSession())) {
      spinner.stop();
      printNotLoggedIn();
      await exitWithTelemetry(1);
    }

    spinner.text = "Fetching projects...";
    const projectTree = await loadProjectTree(getApi(), (stage) => {
      spinner.text = stage === "environments" ? "Fetching environments..." : "Fetching folders...";
    });

    trackEvent("cli_command_executed", { command: "projects", count: projectTree.length });
    spinner.stop();
    renderProjectTree(projectTree);
  } catch (err) {
    if (isAuthError(err)) {
      spinner.stop();
      printNotLoggedIn();
    } else {
      spinner.fail(pc.red(`Error: ${getErrorMessage(err, "Failed to fetch projects")}`));
    }
    await exitWithTelemetry(1);
  }
}
