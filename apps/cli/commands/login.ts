import {
  type DeviceAuthStatus,
  type DeviceCodeResponse,
  deviceAuth,
  validateSession,
} from "@repo/auth";
import ora from "ora";
import pc from "picocolors";

function formatCode(code: string): string {
  if (code.includes("-")) return code;
  if (code.length === 8) return `${code.slice(0, 4)}-${code.slice(4)}`;
  return code;
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

    let userCode: string | null = null;
    let verificationUri: string | null = null;
    let currentStatus: DeviceAuthStatus | "starting" = "starting";

    const result = await deviceAuth.startAuth({
      onCodeReceived: (code: DeviceCodeResponse) => {
        userCode = code.user_code;
        verificationUri = code.verification_uri_complete;

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
      spinner.succeed(pc.green("Login successful!"));
    } else if (result.error) {
      if (currentStatus === "denied") {
        spinner.fail(pc.red("Authorization denied"));
      } else if (currentStatus === "expired") {
        spinner.fail(pc.red("Code expired. Please try again."));
      } else {
        spinner.fail(pc.red(`Error: ${result.error.message}`));
      }
      process.exit(1);
    }
  } catch (err) {
    spinner.fail(pc.red(err instanceof Error ? err.message : String(err)));
    process.exit(1);
  }
}
