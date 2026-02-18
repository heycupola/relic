import { Command } from "commander";
import type { SecretScope } from "lib/types";
import exportSession from "./commands/export-session";
import init from "./commands/init";
import login from "./commands/login";
import logout from "./commands/logout";
import projects from "./commands/projects";
import run from "./commands/run";
import whoami from "./commands/whoami";

const program = new Command()
  .name("relic")
  .description("Zero-knowledge secret management for your projects")
  .version("0.1.0")
  .action(async () => {
    await import("@repo/tui");
  });

program.command("login").description("Authenticate with Relic").action(login);
program.command("logout").description("Clear authentication").action(logout);
program.command("whoami").description("Show current user").action(whoami);
program.command("projects").description("List all projects").action(projects);
program.command("init").description("Initialize Relic for the current project").action(init);
program.command("export-session").description("Export session for CI/CD").action(exportSession);

program
  .command("run")
  .description("Run a command with secrets injected as environment variables")
  .requiredOption("-e, --environment <name>", "Environment name (required)")
  .option("-f, --folder <name>", "Folder name (optional)")
  .option("-s, --scope <scope>", "Scope filter: client, server, or shared (optional)")
  .argument("<command...>", "Command to run")
  .action(
    (command: string[], options: { environment: string; folder?: string; scope?: SecretScope }) => {
      run(command, options);
    },
  );

program.parse();
