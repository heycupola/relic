import { AuthenticationError, validateSession } from "@repo/auth";
import { ConvexError } from "convex/values";
import type { Ora } from "ora";
import pc from "picocolors";
import { findConfig } from "./config";
import { exitWithTelemetry } from "./telemetry";

export const NOT_LOGGED_IN_MESSAGE = "Not logged in. Run `relic login` first.";
export const NO_PASSWORD_MESSAGE =
  "No password set. Run `relic` to open the TUI and set up your password first.";
export const NO_KEYS_MESSAGE =
  "No encryption keys found. Run `relic` to open the TUI and set up your keys first.";
export const PROJECT_ID_REQUIRED_MESSAGE =
  "Project ID is required. Use `--project <id>`, set `RELIC_PROJECT_ID`, or run `relic init`.";

export function getErrorMessage(err: unknown, fallback?: string): string {
  if (err instanceof Error) return err.message;
  return fallback ?? String(err);
}

export function parseConvexError(err: unknown): { code?: string; message: string } {
  if (err instanceof ConvexError) {
    let data = err.data;
    while (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch {
        break;
      }
    }
    if (typeof data === "object" && data !== null) {
      const d = data as { code?: string; message?: string };
      return { code: d.code, message: d.message ?? err.message };
    }
  }
  return { message: getErrorMessage(err) };
}

/** True only for real authentication failures (local session/JWT or a backend UNAUTHORIZED). */
export function isAuthError(err: unknown): boolean {
  if (err instanceof AuthenticationError) return true;
  return parseConvexError(err).code === "UNAUTHORIZED";
}

export async function hasActiveSession(): Promise<boolean> {
  const session = await validateSession();
  return session.isValid && !session.isExpired;
}

export function printNotLoggedIn(): void {
  console.error(pc.yellow("Not logged in"));
  console.error(pc.dim("Run `relic login` to authenticate"));
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
  console.error();
  console.error(pc.dim("  Upgrade at: ") + pc.underline(upgradeUrl));
  console.error();

  if (process.stdin.isTTY) {
    const readline = await import("node:readline");
    const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
    console.error(pc.dim("  Press Enter to open the upgrade page, or Ctrl+C to exit."));
    await new Promise<void>((resolve) =>
      rl.once("line", () => {
        rl.close();
        resolve();
      }),
    );
    const openModule = await import("open");
    await openModule.default(upgradeUrl);
  }

  return exitWithTelemetry(1);
}
