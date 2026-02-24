import * as p from "@clack/prompts";
import { AuthenticationError, validateSession } from "@repo/auth";
import { createLogger, trackEvent } from "@repo/logger";
import pc from "picocolors";

const log = createLogger("cli");

import { getApi, type ProjectListItem } from "../lib/api";
import {
  configExists,
  createConfig,
  createRelicDir,
  getConfigFilePath,
  saveConfig,
} from "../lib/config";

interface ProjectOption extends ProjectListItem {
  isShared: boolean;
}

export default async function init() {
  p.intro(pc.bgCyan(pc.black(" relic init ")));

  if (await configExists()) {
    p.log.warn(pc.yellow("Already initialized"));
    p.outro(pc.dim("Delete relic.toml to re-initialize"));
    return;
  }

  const spinner = p.spinner();
  spinner.start("Checking authentication...");

  const sessionValidation = await validateSession();
  if (!sessionValidation.isValid || sessionValidation.isExpired) {
    spinner.stop("Not logged in");
    p.log.error(pc.yellow("Not logged in"));
    p.outro(pc.dim("Run `relic login` to authenticate"));
    process.exit(1);
  }

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
      p.log.warn(pc.yellow("No projects found. Run `relic` to create a new project"));
      process.exit(1);
    }

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

    spinner.start("Saving configuration...");
    const config = createConfig(selectedProject.id);
    await saveConfig(config);
    await createRelicDir();
    spinner.stop("Configuration saved");

    trackEvent("cli_project_initialized", { success: true });
    p.log.success(pc.green(`Initialized Relic for ${selectedProject.name}`));
    p.outro(pc.dim(`Config saved to ${getConfigFilePath()}`));
  } catch (err) {
    spinner.stop("Failed");

    if (err instanceof AuthenticationError) {
      p.log.error(pc.yellow("Not logged in"));
      p.outro(pc.dim("Run `relic login` to authenticate"));
      process.exit(1);
    }

    log.error("Init failed", err);
    trackEvent("cli_project_initialized", { success: false });
    const message = err instanceof Error ? err.message : "Failed to initialize";
    p.log.error(pc.red(`Error: ${message}`));
    process.exit(1);
  }
}
