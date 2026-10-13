import type { ConsolaReporter, LogObject } from "consola";

type ConsoleMethod = "error" | "warn" | "info" | "debug" | "log";

function methodFor(level: number): ConsoleMethod {
  if (level <= 1) return "error";
  if (level === 2) return "warn";
  if (level === 3) return "info";
  if (level >= 4) return "debug";
  return "log";
}

/**
 * Writes through the global `console` (looked up per call) instead of `process.stdout`, so a TUI
 * renderer that overrides console methods can capture output rather than having it painted over
 * the screen.
 */
export function createConsoleReporter(): ConsolaReporter {
  return {
    log(logObj: LogObject) {
      const tag = logObj.tag ? `[${logObj.tag}]` : "";
      const args = tag ? [tag, ...logObj.args] : logObj.args;
      console[methodFor(logObj.level)](...args);
    },
  };
}
