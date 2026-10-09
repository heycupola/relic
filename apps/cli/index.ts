import { initLogger, isFirstRun, saveTelemetryPreference } from "@repo/logger";
import { Command, CommanderError, Help } from "commander";
import pc from "picocolors";
import check, { type CheckOptions } from "./commands/check";
import importSecrets, { type ImportOptions } from "./commands/import";
import init from "./commands/init";
import login from "./commands/login";
import logout from "./commands/logout";
import projects from "./commands/projects";
import push from "./commands/push";
import run, { type RunOptions } from "./commands/run";
import {
  type ServiceAccountCreateOptions,
  type ServiceAccountRevokeOptions,
  serviceAccountCreate,
  serviceAccountList,
  serviceAccountRevoke,
} from "./commands/service-account";
import shell, { type ShellOptions } from "./commands/shell";
import { telemetryDisable, telemetryEnable, telemetryStatus } from "./commands/telemetry";
import upgrade from "./commands/upgrade";
import whoami from "./commands/whoami";
import type { PushOptions } from "./lib/push/types";
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
    commands: ["run", "shell", "import", "push", "check", "service-account"],
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
  lines.push(`    ${pc.dim("$")} relic shell -e development`);
  lines.push(`    ${pc.dim("$")} relic push -e production --target vercel --dry-run`);
  lines.push(`    ${pc.dim("$")} relic check -e production --scan`);
  lines.push("");

  lines.push(`  ${pc.dim("https://docs.withrelic.com")}`);
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
  .enablePositionalOptions()
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
  .action((options: ServiceAccountCreateOptions) => serviceAccountCreate(options));

saCmd
  .command("list")
  .description("List service accounts for a project")
  .option("-p, --project <id>", "Project ID (optional, defaults to relic.toml or RELIC_PROJECT_ID)")
  .action((options: { project?: string }) => serviceAccountList(options));

saCmd
  .command("revoke")
  .description("Revoke a service account")
  .option("-n, --name <name>", "Service account name to revoke")
  .option("--id <id>", "Service account ID to revoke (use when several share a name)")
  .option("-p, --project <id>", "Project ID (optional, defaults to relic.toml or RELIC_PROJECT_ID)")
  .action((options: ServiceAccountRevokeOptions) => serviceAccountRevoke(options));

program
  .command("mcp")
  .description("Start the Relic MCP server for AI assistants")
  .action(async () => {
    await import("./mcp/server");
  });

const RUN_HELP = `
Environment:
  By default the command gets only the decrypted secrets plus a minimal set of
  variables from your shell: PATH, HOME, USER, SHELL, TERM, LANG, LC_ALL,
  LC_CTYPE, TMPDIR and TZ. Everything else (e.g. NODE_ENV, CI, GITHUB_*) is
  dropped. Use --inherit-env to pass the full environment through.

  Options after the command name belong to the command, not to relic. Use --
  to separate them explicitly.

Examples:
  $ relic run -e production -- npm start
  $ relic run -e staging -f api -- node -e "console.log(process.env.API_URL)"
  $ relic run -e production --inherit-env -- npm run build`;

program
  .command("run")
  .description("Run a command with secrets injected as environment variables")
  .requiredOption("-e, --environment <name>", "Environment name (required)")
  .option("-f, --folder <name>", "Folder name (optional)")
  .option("-s, --scope <scope>", "Scope filter: client, server, or shared (optional)")
  .option("-p, --project <id>", "Project ID (optional, defaults to relic.toml or RELIC_PROJECT_ID)")
  .option(
    "--inherit-env",
    "Pass the current environment (except RELIC_* variables) to the command; secrets take precedence",
  )
  .argument("<command...>", "Command to run")
  .passThroughOptions()
  .addHelpText("after", RUN_HELP)
  .action((command: string[], options: RunOptions) => run(command, options));

program
  .command("shell")
  .description("Open a subshell with secrets loaded as environment variables")
  .requiredOption("-e, --environment <name>", "Environment name (required)")
  .option("-f, --folder <name>", "Folder name (optional)")
  .option("-s, --scope <scope>", "Scope filter: client, server, or shared (optional)")
  .option("-p, --project <id>", "Project ID (optional, defaults to relic.toml or RELIC_PROJECT_ID)")
  .option(
    "--inherit-env",
    "Pass the current environment (except RELIC_* variables) to the shell; secrets take precedence",
  )
  .option("--force", "Open a nested shell even if already inside a relic shell")
  .action((options: ShellOptions) => shell(options));

program
  .command("import")
  .description("Import secrets from a .env file, JSON, or another secrets manager")
  .argument(
    "[source]",
    "Path to a .env or .json file, - for stdin, or doppler, infisical, vercel, 1password (default: .env)",
  )
  .requiredOption("-e, --environment <name>", "Environment name (required)")
  .option("-f, --folder <name>", "Folder name (optional)")
  .option("-p, --project <id>", "Project ID (optional, defaults to relic.toml or RELIC_PROJECT_ID)")
  .option("-s, --scope <scope>", "Default scope for imported secrets: client, server, or shared")
  .option("--format <format>", "Input format for files and stdin: env or json")
  .option("--overwrite", "Overwrite existing secrets with imported values")
  .option("--skip-existing", "Keep existing secrets and import only new ones")
  .option("--dry-run", "Show the import plan without importing")
  .option("-y, --yes", "Skip confirmation prompts")
  .option("--delete-source", "Delete the source file after a successful import (asks first)")
  .option("--doppler-project <name>", "Doppler project (doppler source)")
  .option("--doppler-config <name>", "Doppler config (doppler source)")
  .option("--infisical-env <slug>", "Infisical environment slug (infisical source)")
  .option("--infisical-path <path>", "Infisical secret path (infisical source)")
  .option("--infisical-project <id>", "Infisical project ID (infisical source)")
  .option("--vercel-project <idOrName>", "Vercel project ID or name (vercel source)")
  .option("--vercel-team <id>", "Vercel team ID (vercel source)")
  .option("--vercel-target <target>", "production, preview, or development (vercel source)")
  .option("--op-item <item>", "1Password item name or ID (1password source)")
  .option("--op-vault <vault>", "1Password vault (1password source)")
  .action((source: string | undefined, options: ImportOptions) => importSecrets(source, options));

const collect = (value: string, previous: string[] = []) => [...previous, value];

program
  .command("push")
  .description("Sync an environment's secrets to a deploy platform")
  .requiredOption("-e, --environment <name>", "Environment name (required)")
  .requiredOption("-t, --target <platform>", "Target platform: vercel, cloudflare, github, fly")
  .option("-f, --folder <name>", "Folder name (optional)")
  .option("-s, --scope <scopes>", "Scope filter, comma separated: client, server, shared")
  .option("-p, --project <id>", "Project ID (optional, defaults to relic.toml or RELIC_PROJECT_ID)")
  .option("--dry-run", "Print the plan (names only) and exit without writing")
  .option("--prune", "Delete platform secrets that are not in Relic")
  .option("-y, --yes", "Skip the confirmation prompt (required in CI and non-interactive shells)")
  .option("--vercel-project <id>", "Vercel project ID or name (defaults to .vercel/project.json)")
  .option("--vercel-team <id>", "Vercel team ID or slug (defaults to .vercel/project.json)")
  .option(
    "--vercel-target <target>",
    "Vercel target: production, preview, development (repeatable or comma separated)",
    collect,
  )
  .option("--worker <name>", "Cloudflare Worker name (defaults to the wrangler config)")
  .option("--wrangler-env <env>", "Wrangler environment (as in wrangler --env)")
  .option("--github-repo <owner/repo>", "GitHub repository (defaults to the current repo)")
  .option("--github-env <name>", "GitHub environment for environment-level secrets")
  .option("--fly-app <name>", "Fly app name (defaults to fly.toml)")
  .option("--fly-stage", "Stage Fly secrets without restarting machines")
  .action((options: PushOptions) => {
    push(options);
  });

program
  .command("check")
  .description("Check that required env keys exist in an environment (names only)")
  .requiredOption("-e, --environment <name>", "Environment name (required)")
  .option("-f, --folder <name>", "Folder name (optional)")
  .option("-s, --scope <scope>", "Scope filter: client, server, or shared (optional)")
  .option("-p, --project <id>", "Project ID (optional, defaults to relic.toml or RELIC_PROJECT_ID)")
  .option(
    "--from <file>",
    "Read required keys from this file instead of .env.example/.sample/.template (repeatable)",
    collect,
    [],
  )
  .option("--scan [paths...]", "Also scan source files for env reads (defaults to project root)")
  .option(
    "--ignore <keys>",
    "Keys to skip, comma-separated, * wildcards allowed (repeatable)",
    collect,
    [],
  )
  .option("--compare <environment>", "Compare key names with another environment")
  .option("--strict", "Also fail on unused keys and differences from --compare")
  .option("--json", "Print the result as JSON")
  .action((options: CheckOptions) => {
    check(options);
  });

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

    if (err.code === "commander.help") {
      process.exit(err.exitCode);
    }

    const cleanMessage = err.message.replace(/^error:\s*/i, "");
    console.error();

    if (err.code === "commander.excessArguments") {
      const excess = err.message.match(/got \d+: (.+?)\.?$/)?.[1];
      console.error(
        `  ${pc.red(pc.bold("Unexpected argument:"))} ${pc.white(excess ?? cleanMessage)}`,
      );
    } else if (err.code === "commander.unknownCommand") {
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
    } else if (err.code === "commander.unknownOption" && process.argv.slice(2).includes("run")) {
      console.error(`  ${pc.red(pc.bold("Error:"))} ${pc.dim(cleanMessage)}`);
      console.error(
        `\n  ${pc.dim("If this option is meant for your command, put it after")} ${pc.white("--")}${pc.dim(":")}`,
      );
      console.error(`    ${pc.dim("$")} relic run -e <environment> -- <command> --your-flag`);
    } else {
      console.error(`  ${pc.red(pc.bold("Error:"))} ${pc.dim(cleanMessage)}`);
    }

    console.error(`\n  ${pc.dim(`Run ${pc.white("relic --help")} for more information.`)}\n`);
    process.exit(1);
  }

  throw err;
}
