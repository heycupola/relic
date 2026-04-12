import { resolve } from "node:path";

const HOME = process.env.HOME || process.env.USERPROFILE || "~";
const IS_DEV = process.env.DEV === "true";

const DIR_NAME = IS_DEV ? "relic-dev" : "relic";

export const CONFIG_DIR =
  process.platform === "win32"
    ? resolve(HOME, "AppData", "Roaming", DIR_NAME)
    : resolve(HOME, ".config", DIR_NAME);

export const KEYCHAIN_SERVICE = IS_DEV ? "com.relic.tui.dev" : "com.relic.tui";

export function getConfigDir(): string {
  return CONFIG_DIR;
}

export function isDev(): boolean {
  return IS_DEV;
}
