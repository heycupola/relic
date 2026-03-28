import { initLogger, isFirstRun, saveTelemetryPreference } from "@repo/logger";
import { Command, CommanderError } from "commander";
import type { SecretScope } from "lib/types";
import pc from "picocolors";
import init from "./commands/init";
import login from "./commands/login";
import logout from "./commands/logout";
import projects from "./commands/projects";
import run from "./commands/run";
import { telemetryDisable, telemetryEnable, telemetryStatus } from "./commands/telemetry";
import whoami from "./commands/whoami";
import pkg from "./package.json";

await initLogger();

if (isFirstRun()) {
  console.error(
    pc.dim(
      "Relic collects anonymous usage data to improve the product. Run `relic telemetry disable` to opt out.",
    ),
  );
  saveTelemetryPreference(true);
}

function printAvailableCommands() {
  console.error(pc.dim("  Available commands:\n"));
  for (const cmd of program.commands) {
    console.error(`    ${pc.cyan(cmd.name().padEnd(14))} ${pc.dim(cmd.description())}`);
  }
}

function printHelpHint() {
  console.error(`\n  ${pc.dim(`Run ${pc.white("relic --help")} for more information.`)}\n`);
}

async function loadTui() {
  try {
    const tuiEntry = new URL("../../packages/tui/index.tsx", import.meta.url).href;
    await import(tuiEntry);
  } catch {
    console.error(
      pc.red(pc.bold("\n  TUI is not available in standalone binary installations.\n")),
    );
    console.error(
      pc.dim("  Use CLI commands instead. Run ") +
        pc.white("relic --help") +
        pc.dim(" to see available commands.\n"),
    );
    process.exit(1);
  }
}

const program = new Command()
  .name("relic")
  .description("Zero-knowledge secret layer for your projects")
  .version(pkg.version)
  .exitOverride()
  .configureOutput({
    outputError: () => {
      /* suppressed */
    },
  })
  .action(async () => {
    process.env._RELIC_FROM_CLI = "true";
    await loadTui();
  });

program.command("login").description("Authenticate with Relic").action(login);
program.command("logout").description("Clear authentication").action(logout);
program.command("whoami").description("Show current user").action(whoami);
program.command("projects").description("List all projects").action(projects);
program.command("init").description("Initialize Relic for the current project").action(init);

const telemetryCmd = program
  .command("telemetry")
  .description("Manage anonymous usage data collection");
telemetryCmd.command("status").description("Show telemetry status").action(telemetryStatus);
telemetryCmd.command("enable").description("Enable telemetry").action(telemetryEnable);
telemetryCmd.command("disable").description("Disable telemetry").action(telemetryDisable);

program
  .command("mcp")
  .description("Start the Relic MCP server for AI assistants")
  .action(async () => {
    await import("./mcp/server");
  });

program
  .command("run")
  .description("Run a command with secrets injected as environment variables")
  .requiredOption("-e, --environment <name>", "Environment name (required)")
  .option("-f, --folder <name>", "Folder name (optional)")
  .option("-s, --scope <scope>", "Scope filter: client, server, or shared (optional)")
  .option("-p, --project <id>", "Project ID (optional, defaults to relic.toml or RELIC_PROJECT_ID)")
  .argument("<command...>", "Command to run")
  .action(
    (
      command: string[],
      options: { environment: string; folder?: string; scope?: SecretScope; project?: string },
    ) => {
      run(command, options);
    },
  );

try {
  await program.parseAsync();
} catch (err) {
  if (err instanceof CommanderError) {
    if (err.code === "commander.helpDisplayed" || err.code === "commander.version") {
      process.exit(0);
    }

    const cleanMessage = err.message.replace(/^error:\s*/i, "");
    console.error();

    if (err.code === "commander.unknownCommand" || err.code === "commander.excessArguments") {
      const unknown =
        err.message.match(/'(.+?)'/)?.[1] ??
        process.argv.find(
          (arg) => !arg.startsWith("-") && arg !== process.argv[0] && arg !== process.argv[1],
        );
      console.error(`  ${pc.red(pc.bold("Unknown command:"))} ${pc.white(unknown ?? "unknown")}`);
      console.error();
      printAvailableCommands();
    } else if (err.code === "commander.missingArgument") {
      console.error(`  ${pc.red(pc.bold("Missing argument:"))} ${pc.dim(cleanMessage)}`);
    } else if (err.code === "commander.missingMandatoryOptionValue") {
      console.error(`  ${pc.red(pc.bold("Missing required option:"))} ${pc.dim(cleanMessage)}`);
    } else if (err.code === "commander.optionMissingArgument") {
      console.error(`  ${pc.red(pc.bold("Option missing argument:"))} ${pc.dim(cleanMessage)}`);
    } else {
      console.error(`  ${pc.red(pc.bold("Error:"))} ${pc.dim(cleanMessage)}`);
    }

    printHelpHint();
    process.exit(1);
  }

  throw err;
}
