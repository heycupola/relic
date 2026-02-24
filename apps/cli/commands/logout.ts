import {
  clearCachedUserKeys,
  clearPassword,
  clearSession,
  getUserKeyCacheDb,
  validateSession,
} from "@repo/auth";
import { createLogger, trackEvent } from "@repo/logger";
import ora from "ora";
import pc from "picocolors";

const log = createLogger("cli");

export default async function logout() {
  const spinner = ora("Checking session...").start();

  try {
    const session = await validateSession();

    if (!session.isValid) {
      spinner.warn(pc.yellow("Not logged in"));
      return;
    }

    spinner.text = "Logging out...";
    const userKeyDb = await getUserKeyCacheDb();
    clearCachedUserKeys(userKeyDb);
    await clearSession();
    await clearPassword();
    trackEvent("cli_logout", { success: true });
    spinner.succeed(pc.green("Logged out"));
  } catch (err) {
    log.error("Logout failed", err);
    trackEvent("cli_logout", { success: false });
    const message = err instanceof Error ? err.message : "Failed to logout";
    spinner.fail(pc.red(`Error: ${message}`));
    process.exit(1);
  }
}
