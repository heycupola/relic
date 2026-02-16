import { loadSession } from "@repo/auth";

export default async function exportSession() {
  const session = await loadSession();

  if (!session) {
    console.error("Not logged in. Run 'relic login' first.");
    process.exit(1);
  }

  const base64 = Buffer.from(JSON.stringify(session)).toString("base64");
  console.log(base64);
}
