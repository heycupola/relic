import { clearSession, validateSession } from "@repo/auth";
import ora from "ora";
import pc from "picocolors";

export default async function logout() {
  const spinner = ora("Checking session...").start();

  try {
    const session = await validateSession();

    if (!session.isValid) {
      spinner.warn(pc.yellow("Not logged in"));
      return;
    }

    spinner.text = "Logging out...";
    await clearSession();
    spinner.succeed(pc.green("Logged out"));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to logout";
    spinner.fail(pc.red(`Error: ${message}`));
    process.exit(1);
  }
}
