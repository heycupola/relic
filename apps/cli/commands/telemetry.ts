import { getTelemetryPreference, saveTelemetryPreference } from "@repo/logger";
import pc from "picocolors";

export async function telemetryStatus() {
  const preference = getTelemetryPreference();

  if (preference === null) {
    console.log(`Telemetry: ${pc.green("enabled")} ${pc.dim("(default)")}`);
  } else if (preference) {
    console.log(`Telemetry: ${pc.green("enabled")}`);
  } else {
    console.log(`Telemetry: ${pc.yellow("disabled")}`);
  }

  console.log();
  console.log(pc.dim("Relic collects anonymous usage data to improve the product."));
  console.log(
    pc.dim("No secrets, secret names, project names or IDs, or account details are collected."),
  );
  console.log(
    pc.dim(
      "Error reports include the error message and stack trace. CLI stack traces are reduced to",
    ),
  );
  console.log(pc.dim("file names; TUI stack traces may include local file paths."));
}

export async function telemetryEnable() {
  saveTelemetryPreference(true);
  console.log(pc.green("Telemetry enabled"));
}

export async function telemetryDisable() {
  saveTelemetryPreference(false);
  console.log(pc.yellow("Telemetry disabled"));
}
