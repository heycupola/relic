import { trackEvent } from "@repo/logger";
import ora from "ora";
import pc from "picocolors";
import { getApi } from "../lib/api";
import {
  getErrorMessage,
  hasActiveSession,
  isAuthErrorMessage,
  printNotLoggedIn,
} from "../lib/cli";

export default async function whoami() {
  const spinner = ora("Fetching user info...").start();

  try {
    if (!(await hasActiveSession())) {
      spinner.stop();
      printNotLoggedIn();
      return;
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
    const message = getErrorMessage(err, "Failed to fetch user");
    if (isAuthErrorMessage(message)) {
      spinner.stop();
      printNotLoggedIn();
      return;
    }
    spinner.fail(pc.red(`Error: ${message}`));
    process.exit(1);
  }
}
