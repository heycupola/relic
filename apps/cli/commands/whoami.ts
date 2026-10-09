import { trackEvent } from "@repo/logger";
import ora from "ora";
import pc from "picocolors";
import { getApi } from "../lib/api";
import { getErrorMessage, hasActiveSession, isAuthError, printNotLoggedIn } from "../lib/cli";
import { exitWithTelemetry } from "../lib/telemetry";

export default async function whoami() {
  const spinner = ora("Fetching user info...").start();

  try {
    if (!(await hasActiveSession())) {
      spinner.stop();
      printNotLoggedIn();
      await exitWithTelemetry(1);
    }

    const user = await getApi().getCurrentUser();

    trackEvent("cli_command_executed", { command: "whoami" });
    spinner.stop();
    console.log(pc.bold("Logged in as:"));
    console.log();
    console.log(`${pc.dim("Name:")}  ${user.name}`);
    console.log(`${pc.dim("Email:")} ${user.email}`);
    console.log(`${pc.dim("Plan:")}  ${user.hasPro ? pc.green("Pro") : "Free"}`);
  } catch (err) {
    if (isAuthError(err)) {
      spinner.stop();
      printNotLoggedIn();
    } else {
      spinner.fail(pc.red(`Error: ${getErrorMessage(err, "Failed to fetch user")}`));
    }
    await exitWithTelemetry(1);
  }
}
