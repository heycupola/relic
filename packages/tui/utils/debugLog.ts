import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DEV_LOG_FILE, isDev, RELIC_LOGS_DIR } from "./paths";

const PROD_ERROR_LOG = resolve(RELIC_LOGS_DIR, "error.log");

function formatValue(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "string") return value;
  if (value instanceof Error) {
    return `${value.name}: ${value.message}${value.stack ? `\n${value.stack}` : ""}`;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function formatMessage(args: unknown[]): string {
  return args.map(formatValue).join(" ");
}

function ensureDirSync(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function writeLog(level: string, message: string, forceWrite = false): void {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [${level}] ${message}\n`;

  try {
    if (isDev) {
      appendFileSync(DEV_LOG_FILE, line);
    } else if (forceWrite) {
      ensureDirSync(PROD_ERROR_LOG);
      appendFileSync(PROD_ERROR_LOG, line);
    }
  } catch {
    // Silently fail - logging should not crash the app
  }
}

export const logger = {
  log: (...args: unknown[]) => {
    writeLog("LOG", formatMessage(args));
  },
  info: (...args: unknown[]) => {
    writeLog("INFO", formatMessage(args));
  },
  warn: (...args: unknown[]) => {
    writeLog("WARN", formatMessage(args));
  },
  debug: (...args: unknown[]) => {
    writeLog("DEBUG", formatMessage(args));
  },
  error: (...args: unknown[]) => {
    writeLog("ERROR", formatMessage(args), true);
  },
};

export function initLogger(): void {
  if (isDev) {
    try {
      ensureDirSync(DEV_LOG_FILE);
      writeFileSync(DEV_LOG_FILE, "");
      const timestamp = new Date().toISOString();
      appendFileSync(DEV_LOG_FILE, `[${timestamp}] Logger initialized. Using sync FS APIs.\n`);
    } catch {
      // Silently fail - logging setup should not crash the app
    }
  } else {
    ensureDirSync(PROD_ERROR_LOG);
  }
}
