import { validateSession } from "@repo/auth";
import { trackEvent } from "@repo/logger";
import ora from "ora";
import pc from "picocolors";
import { getApi } from "../lib/api";

export default async function whoami() {
  const spinner = ora("Fetching user info...").start();

  try {
    const sessionValidation = await validateSession();
    if (!sessionValidation.isValid || sessionValidation.isExpired) {
      spinner.stop();
      console.log(pc.yellow("Not logged in"));
      console.log(pc.dim("Run `relic login` to authenticate"));
      return;
    }

    const api = getApi();
    const user = await api.getCurrentUser();

    trackEvent("cli_command_executed", { command: "whoami" });
    spinner.stop();
    console.log(pc.bold("Logged in as:"));
    console.log();
    console.log(`${pc.dim("Name:")}  ${user.name}`);
    console.log(`${pc.dim("Email:")} ${user.email}`);
    console.log(`${pc.dim("Plan:")}  ${user.hasPro ? pc.green("Pro") : "Free"}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch user";
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
