import { loadSession } from "@repo/auth";
import { trackEvent } from "@repo/logger";

export default async function exportSession() {
  trackEvent("cli_command_executed", { command: "export-session" });
  const session = await loadSession();

  if (!session) {
    console.error("Not logged in. Run 'relic login' first.");
    process.exit(1);
  }

  const base64 = Buffer.from(JSON.stringify(session)).toString("base64");
  console.log(base64);
}
