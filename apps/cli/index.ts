import { Command } from "commander";

const program = new Command()
  .name("relic")
  .description("Zero-knowledge secret management for your projects")
  .version("0.1.0");

// Commands will be added here as we implement them
// Example:
// program.command("login").description("Authenticate with Relic").action(login);
// program.command("logout").description("Clear authentication").action(logout);
// program.command("run <command...>").description("Run with secrets").action(run);

program.parse();
