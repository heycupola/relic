import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const HOME = process.env.HOME || process.env.USERPROFILE || "~";
const DIR_NAME = process.env.DEV === "true" ? "relic-dev" : "relic";

const CONFIG_DIR =
  process.platform === "win32"
    ? resolve(HOME, "AppData", "Roaming", DIR_NAME)
    : resolve(HOME, ".config", DIR_NAME);

const LOGS_DIR = resolve(CONFIG_DIR, "logs");
const TELEMETRY_FILE = resolve(CONFIG_DIR, "telemetry.json");

const DEFAULT_DEV_LOG = resolve(LOGS_DIR, "debug.log");
const DEFAULT_PROD_LOG = resolve(LOGS_DIR, "relic.log");

export type LogLevel = "debug" | "info" | "warn" | "error" | "off";

export interface LoggerConfig {
  level: LogLevel;
  logFile: string;
  isDev: boolean;
  isCI: boolean;
  telemetryEnabled: boolean;
  telemetryProxyUrl: string;
  posthogApiKey: string;
}

function isDev(): boolean {
  return process.env.DEV === "true";
}

function isCI(): boolean {
  return process.env.CI === "true" || !!process.env.CI;
}

function parseLevel(): LogLevel {
  const env = process.env.RELIC_LOG?.toLowerCase();
  if (env && ["debug", "info", "warn", "error", "off"].includes(env)) {
    return env as LogLevel;
  }
  return isDev() ? "info" : "warn";
}

function readTelemetryPreference(): boolean | null {
  try {
    if (!existsSync(TELEMETRY_FILE)) return null;
    const data = JSON.parse(readFileSync(TELEMETRY_FILE, "utf-8"));
    return typeof data.enabled === "boolean" ? data.enabled : null;
  } catch {
    return null;
  }
}

function isTelemetryEnabled(): boolean {
  if (process.env.RELIC_TELEMETRY === "false") return false;
  if (isCI()) return false;
  if (isDev()) return false;
  const preference = readTelemetryPreference();
  if (preference !== null) return preference;
  return true;
}

export function getConfig(): LoggerConfig {
  return {
    level: parseLevel(),
    logFile: process.env.RELIC_LOG_FILE || (isDev() ? DEFAULT_DEV_LOG : DEFAULT_PROD_LOG),
    isDev: isDev(),
    isCI: isCI(),
    telemetryEnabled: isTelemetryEnabled(),
    telemetryProxyUrl: process.env.RELIC_TELEMETRY_URL || "https://telemetry.relic.so",
    posthogApiKey: process.env.RELIC_POSTHOG_KEY || "",
  };
}

export function ensureLogDir(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export function saveTelemetryPreference(enabled: boolean): void {
  try {
    const dir = dirname(TELEMETRY_FILE);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(TELEMETRY_FILE, JSON.stringify({ enabled }, null, 2));
  } catch {
    // NOTE: Best-effort
  }
}

export function getTelemetryPreference(): boolean | null {
  return readTelemetryPreference();
}

export function isFirstRun(): boolean {
  return readTelemetryPreference() === null;
}

export function getConfigDir(): string {
  return CONFIG_DIR;
}

export function getLogsDir(): string {
  return LOGS_DIR;
}
