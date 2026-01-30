import * as p from "@clack/prompts";
import { validateSession } from "@repo/auth";
import pc from "picocolors";
import { getApi, type ProjectListItem } from "../lib/api";
import { configExists, createConfig, getConfigFilePath, saveConfig } from "../lib/config";

interface ProjectOption extends ProjectListItem {
  isShared: boolean;
}

export default async function init() {
  p.intro(pc.bgCyan(pc.black(" relic init ")));

  // Check if already initialized
  if (await configExists()) {
    p.log.warn(pc.yellow("Already initialized"));
    p.outro(pc.dim("Delete .relic/ directory to re-initialize"));
    return;
  }

  // Check authentication
  const spinner = p.spinner();
  spinner.start("Checking authentication...");

  const sessionValidation = await validateSession();
  if (!sessionValidation.isValid || sessionValidation.isExpired) {
    spinner.stop("Not logged in");
    p.log.error(pc.yellow("Not logged in"));
    p.outro(pc.dim("Run `relic login` to authenticate"));
    process.exit(1);
  }

  // Fetch projects
  spinner.message("Loading projects...");

  try {
    const api = getApi();
    const [ownedProjects, sharedProjects] = await Promise.all([
      api.listProjects(),
      api.listSharedProjects(),
    ]);

    const allProjects: ProjectOption[] = [
      ...ownedProjects.filter((p) => !p.isArchived).map((p) => ({ ...p, isShared: false })),
      ...sharedProjects.filter((p) => !p.isArchived).map((p) => ({ ...p, isShared: true })),
    ];

    spinner.stop("Projects loaded");

    if (allProjects.length === 0) {
      p.log.error(pc.red("No projects found. Create one at app.relic.so"));
      process.exit(1);
    }

    // Let user select a project
    const selectedProjectId = await p.select({
      message: "Select a project",
      options: allProjects.map((project) => ({
        value: project.id,
        label: project.isShared ? `${project.name} ${pc.dim("(shared)")}` : project.name,
      })),
    });

    if (p.isCancel(selectedProjectId)) {
      p.cancel("Operation cancelled");
      process.exit(0);
    }

    const selectedProject = allProjects.find((p) => p.id === selectedProjectId);
    if (!selectedProject) {
      p.log.error(pc.red("Failed to find selected project"));
      process.exit(1);
    }

    // Save config
    spinner.start("Saving configuration...");
    const config = createConfig(selectedProject.id, selectedProject.name);
    await saveConfig(config);
    spinner.stop("Configuration saved");

    p.log.success(pc.green(`Initialized Relic for ${selectedProject.name}`));
    p.outro(pc.dim(`Config saved to ${getConfigFilePath()}`));
  } catch (err) {
    spinner.stop("Failed");
    const message = err instanceof Error ? err.message : "Failed to initialize";
    // Handle auth-related errors more gracefully
    if (
      message.includes("Not authenticated") ||
      message.includes("JWT") ||
      message.includes("token")
    ) {
      p.log.error(pc.yellow("Not logged in"));
      p.outro(pc.dim("Run `relic login` to authenticate"));
      process.exit(1);
    }
    p.log.error(pc.red(`Error: ${message}`));
    process.exit(1);
  }
}
