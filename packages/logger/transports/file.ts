import { appendFileSync, writeFileSync } from "node:fs";
import type { ConsolaReporter, LogObject } from "consola";
import { ensureLogDir } from "../config";

const LEVEL_NAMES: Record<number, string> = {
  0: "FATAL",
  1: "ERROR",
  2: "WARN",
  3: "INFO",
  4: "DEBUG",
  5: "TRACE",
};

function formatLogLine(logObj: LogObject): string {
  const timestamp = new Date().toISOString();
  const level = LEVEL_NAMES[logObj.level] || "LOG";
  const tag = logObj.tag ? `[${logObj.tag}]` : "";

  const parts = logObj.args.map((arg) => {
    if (arg instanceof Error) {
      return `${arg.name}: ${arg.message}${arg.stack ? `\n${arg.stack}` : ""}`;
    }
    if (typeof arg === "string") return arg;
    try {
      return JSON.stringify(arg, null, 2);
    } catch {
      return String(arg);
    }
  });

  return `[${timestamp}] [${level}] ${tag} ${parts.join(" ")}`.trim();
}

export function createFileReporter(logFile: string): ConsolaReporter {
  let initialized = false;

  return {
    log(logObj: LogObject) {
      try {
        if (!initialized) {
          ensureLogDir(logFile);
          initialized = true;
        }
        const line = formatLogLine(logObj);
        appendFileSync(logFile, `${line}\n`);
      } catch {
        // Logging should never crash the app
      }
    },
  };
}

export function clearLogFile(logFile: string): void {
  try {
    ensureLogDir(logFile);
    writeFileSync(logFile, "");
  } catch {
    // Best-effort
  }
}
