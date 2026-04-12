import { initLogger, isFirstRun, saveTelemetryPreference } from "@repo/logger";
import { Command, CommanderError, Help } from "commander";
import type { SecretScope } from "lib/types";
import pc from "picocolors";
import init from "./commands/init";
import login from "./commands/login";
import logout from "./commands/logout";
import projects from "./commands/projects";
import run from "./commands/run";
import {
  serviceAccountCreate,
  serviceAccountList,
  serviceAccountRevoke,
} from "./commands/service-account";
import { telemetryDisable, telemetryEnable, telemetryStatus } from "./commands/telemetry";
import upgrade from "./commands/upgrade";
import whoami from "./commands/whoami";
import pkg from "./package.json";

await initLogger();

if (isFirstRun()) {
  console.error();
  console.error(`  ${pc.bold("relic")} ${pc.dim(`v${pkg.version}`)}`);
  console.error(`  ${pc.dim("Zero-knowledge secret layer for your projects")}`);
  console.error();
  console.error(`  ${pc.green("✓")} ${pc.dim("Ready to use")}`);
  console.error();
  console.error(`  ${pc.dim("Get started:")}`);
  console.error(
    `    ${pc.dim("$")} ${pc.cyan("relic login")}       ${pc.dim("Sign in to your account")}`,
  );
  console.error(
    `    ${pc.dim("$")} ${pc.cyan("relic init")}        ${pc.dim("Initialize in your project")}`,
  );
  console.error(`    ${pc.dim("$")} ${pc.cyan("relic --help")}      ${pc.dim("See all commands")}`);
  console.error();
  console.error(
    `  ${pc.dim("Relic collects anonymous usage data. Run")} ${pc.white("relic telemetry disable")} ${pc.dim("to opt out.")}`,
  );
  console.error();
  saveTelemetryPreference(true);
}

const COMMAND_GROUPS = [
  {
    label: "Auth",
    commands: ["login", "logout", "whoami"],
  },
  {
    label: "Projects",
    commands: ["projects", "init"],
  },
  {
    label: "Secrets",
    commands: ["run", "service-account"],
  },
  {
    label: "Tools",
    commands: ["mcp", "telemetry", "version", "upgrade"],
  },
];

function formatCustomHelp(): string {
  const lines: string[] = [];

  lines.push("");
  lines.push(`  ${pc.bold("relic")} ${pc.dim(`v${pkg.version}`)}`);
  lines.push(`  ${pc.dim("Zero-knowledge secret layer for your projects")}`);
  lines.push("");
  lines.push(`  ${pc.white("Usage")}  ${pc.dim("$")} relic ${pc.dim("<command> [options]")}`);
  lines.push("");

  const cmdMap = new Map<string, { name: string; desc: string }>();
  for (const cmd of program.commands) {
    cmdMap.set(cmd.name(), { name: cmd.name(), desc: cmd.description() });
  }

  for (const group of COMMAND_GROUPS) {
    lines.push(`  ${pc.white(group.label)}`);
    for (const name of group.commands) {
      const cmd = cmdMap.get(name);
      if (cmd) {
        lines.push(`    ${pc.cyan(cmd.name.padEnd(18))}${pc.dim(cmd.desc)}`);
      }
    }
    lines.push("");
  }

  lines.push(`  ${pc.white("Options")}`);
  lines.push(`    ${pc.cyan("-V, --version".padEnd(18))}${pc.dim("Show version number")}`);
  lines.push(`    ${pc.cyan("-h, --help".padEnd(18))}${pc.dim("Show this help message")}`);
  lines.push("");

  lines.push(`  ${pc.white("Examples")}`);
  lines.push(`    ${pc.dim("$")} relic login`);
  lines.push(`    ${pc.dim("$")} relic init`);
  lines.push(`    ${pc.dim("$")} relic run -e production -- npm start`);
  lines.push("");

  lines.push(`  ${pc.dim("https://relic.so/docs")}`);
  lines.push("");

  return lines.join("\n");
}

const defaultFormatHelp = Help.prototype.formatHelp;

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
  .configureHelp({
    formatHelp: (cmd, helper) => {
      if (!cmd.parent) {
        return formatCustomHelp();
      }
      return defaultFormatHelp.call(helper, cmd, helper);
    },
  })
  .configureOutput({
    outputError: () => {
      /* suppressed */
    },
  })
  .action(async () => {
    process.env._RELIC_FROM_CLI = "true";
    process.env._RELIC_VERSION = pkg.version;
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

const saCmd = program.command("service-account").description("Manage service accounts for CI/CD");

saCmd
  .command("create")
  .description("Create a service account for a project")
  .requiredOption("-n, --name <name>", "Service account name")
  .option("-p, --project <id>", "Project ID (optional, defaults to relic.toml or RELIC_PROJECT_ID)")
  .option("--expires-in <days>", "Expiration in days (optional, max 365)")
  .option("--github <org/repo>", "Enable OIDC for GitHub Actions (e.g. myorg/myrepo)")
  .option("--gitlab <group/project>", "Enable OIDC for GitLab CI (e.g. mygroup/myproject)")
  .option("--branch <name>", "Branch restriction for OIDC (default: * for all branches)")
  .option("--oidc-issuer <url>", "OIDC issuer URL (advanced, prefer --github or --gitlab)")
  .option("--oidc-subject <pattern>", "OIDC subject pattern (advanced)")
  .option("--oidc-audience <aud>", "OIDC audience (optional)")
  .action(
    (options: {
      name: string;
      project?: string;
      expiresIn?: string;
      github?: string;
      gitlab?: string;
      branch?: string;
      oidcIssuer?: string;
      oidcSubject?: string;
      oidcAudience?: string;
    }) => {
      serviceAccountCreate(options);
    },
  );

saCmd
  .command("list")
  .description("List service accounts for a project")
  .option("-p, --project <id>", "Project ID (optional, defaults to relic.toml or RELIC_PROJECT_ID)")
  .action((options: { project?: string }) => {
    serviceAccountList(options);
  });

saCmd
  .command("revoke")
  .description("Revoke a service account")
  .requiredOption("-n, --name <name>", "Service account name to revoke")
  .option("-p, --project <id>", "Project ID (optional, defaults to relic.toml or RELIC_PROJECT_ID)")
  .action((options: { name: string; project?: string }) => {
    serviceAccountRevoke(options);
  });

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

program
  .command("version")
  .description("Show current version")
  .action(() => {
    console.log(pkg.version);
  });

program.command("upgrade").description("Upgrade Relic to the latest version").action(upgrade);

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
      console.error(pc.dim("  Available commands:\n"));
      for (const cmd of program.commands) {
        console.error(`    ${pc.cyan(cmd.name().padEnd(18))}${pc.dim(cmd.description())}`);
      }
    } else if (err.code === "commander.missingArgument") {
      console.error(`  ${pc.red(pc.bold("Missing argument:"))} ${pc.dim(cleanMessage)}`);
    } else if (err.code === "commander.missingMandatoryOptionValue") {
      console.error(`  ${pc.red(pc.bold("Missing required option:"))} ${pc.dim(cleanMessage)}`);
    } else if (err.code === "commander.optionMissingArgument") {
      console.error(`  ${pc.red(pc.bold("Option missing argument:"))} ${pc.dim(cleanMessage)}`);
    } else {
      console.error(`  ${pc.red(pc.bold("Error:"))} ${pc.dim(cleanMessage)}`);
    }

    console.error(`\n  ${pc.dim(`Run ${pc.white("relic --help")} for more information.`)}\n`);
    process.exit(1);
  }

  throw err;
}
