import {
  type DeviceAuthStatus,
  type DeviceCodeResponse,
  deviceAuth,
  SITE_URL,
  validateSession,
} from "@repo/auth";
import { createLogger, trackEvent } from "@repo/logger";
import ora from "ora";
import pc from "picocolors";

const log = createLogger("cli");

function formatCode(code: string): string {
  if (code.includes("-")) return code;
  if (code.length === 8) return `${code.slice(0, 4)}-${code.slice(4)}`;
  return code;
}

function normalizeVerificationUri(uri: string): string {
  try {
    const current = new URL(uri);
    const expected = new URL(SITE_URL);
    const isLocalhost = current.hostname === "localhost" || current.hostname === "127.0.0.1";

    if (isLocalhost && current.host !== expected.host) {
      current.protocol = expected.protocol;
      current.host = expected.host;
      return current.toString();
    }
  } catch {
    // Ignore invalid URLs and fall back to the server-provided value.
  }

  return uri;
}

export default async function login() {
  const spinner = ora("Connecting to server...").start();

  try {
    // Check if already logged in
    const sessionValidation = await validateSession();
    if (sessionValidation.isValid && !sessionValidation.isExpired) {
      spinner.succeed(pc.green("Already logged in"));
      return;
    }

    trackEvent("cli_login_started");

    let userCode: string | null = null;
    let verificationUri: string | null = null;
    let currentStatus: DeviceAuthStatus | "starting" | "approved" = "starting";

    const result = await deviceAuth.startAuth({
      onCodeReceived: (code: DeviceCodeResponse) => {
        userCode = code.user_code;
        verificationUri = normalizeVerificationUri(code.verification_uri_complete);

        spinner.stop();
        console.log();
        console.log("Your verification code:");
        console.log();
        console.log(`  ${pc.bold(pc.green(formatCode(userCode)))}`);
        console.log();
        if (verificationUri) {
          console.log(pc.dim(`Opening browser to: ${verificationUri}`));
        }
        console.log();
        spinner.start("Waiting for authorization...");
      },
      onStatusChange: (newStatus: DeviceAuthStatus) => {
        currentStatus = newStatus;
      },
      onSuccess: () => {
        currentStatus = "approved";
      },
      onError: (error: Error) => {
        spinner.fail(pc.red(`Error: ${error.message}`));
        process.exit(1);
      },
    });

    if (result.success) {
      trackEvent("cli_login_completed", { success: true });
      spinner.succeed(pc.green("Login successful!"));
    } else if (result.error) {
      trackEvent("cli_login_completed", { success: false, reason: currentStatus });
      if ((currentStatus as string) === "denied") {
        spinner.fail(pc.red("Authorization denied"));
      } else if ((currentStatus as string) === "expired") {
        spinner.fail(pc.red("Code expired. Please try again."));
      } else {
        spinner.fail(pc.red(`Error: ${result.error.message}`));
      }
      process.exit(1);
    }
  } catch (err) {
    log.error("Login failed", err);
    trackEvent("cli_login_completed", { success: false });
    spinner.fail(pc.red(err instanceof Error ? err.message : String(err)));
    process.exit(1);
  }
}
