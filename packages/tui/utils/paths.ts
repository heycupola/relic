import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HOME = process.env.HOME || process.env.USERPROFILE || "~";
export const RELIC_DIR = resolve(HOME, ".relic");
export const RELIC_LOGS_DIR = resolve(RELIC_DIR, "logs");
export const RELIC_PASSWORD_FILE = resolve(RELIC_DIR, "password");

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, "..");
export const DEV_LOG_FILE = resolve(__dirname, "..", "debug.log");

export const isDev = process.env.DEV === "true";

export async function ensureRelicDir(): Promise<void> {
  const relicDir = Bun.file(RELIC_DIR);
  const logsDir = Bun.file(RELIC_LOGS_DIR);

  if (!(await relicDir.exists())) {
    await mkdir(RELIC_DIR, { recursive: true });
  }
  if (!(await logsDir.exists())) {
    await mkdir(RELIC_LOGS_DIR, { recursive: true });
  }
}
