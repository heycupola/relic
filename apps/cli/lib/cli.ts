import { validateSession } from "@repo/auth";
import type { Ora } from "ora";
import pc from "picocolors";
import { findConfig } from "./config";

export const NOT_LOGGED_IN_MESSAGE = "Not logged in. Run 'relic login' first.";
export const NO_PASSWORD_MESSAGE = "No password set. Run 'relic' to set up your password first.";
export const PROJECT_ID_REQUIRED_MESSAGE =
  "Project ID is required. Use --project <id> or set RELIC_PROJECT_ID.";

export function getErrorMessage(err: unknown, fallback?: string): string {
  if (err instanceof Error) return err.message;
  return fallback ?? String(err);
}

export async function hasActiveSession(): Promise<boolean> {
  const session = await validateSession();
  return session.isValid && !session.isExpired;
}

export function isAuthErrorMessage(message: string): boolean {
  return (
    message.includes("Not authenticated") || message.includes("JWT") || message.includes("token")
  );
}

export function printNotLoggedIn(): void {
  console.log(pc.yellow("Not logged in"));
  console.log(pc.dim("Run `relic login` to authenticate"));
}

export function resolveProjectIdFromEnv(projectId?: string): string | null {
  return projectId || process.env.RELIC_PROJECT_ID || null;
}

export async function resolveProjectIdWithConfig(projectId?: string): Promise<string | null> {
  const explicit = resolveProjectIdFromEnv(projectId);
  if (explicit) return explicit;
  const configResult = await findConfig();
  return configResult?.config.project_id ?? null;
}

export async function failWithUpgradePrompt(
  spinner: Ora,
  message: string,
  upgradeUrl: string,
): Promise<never> {
  spinner.fail(pc.red(message));
  console.log();
  console.log(pc.dim("  Upgrade at: ") + pc.underline(upgradeUrl));
  console.log();

  if (process.stdin.isTTY) {
    const readline = await import("node:readline");
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    console.log(pc.dim("  Press Enter to open the upgrade page, or Ctrl+C to exit."));
    await new Promise<void>((resolve) =>
      rl.once("line", () => {
        rl.close();
        resolve();
      }),
    );
    const openModule = await import("open");
    await openModule.default(upgradeUrl);
  }

  process.exit(1);
}
