type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function getMinLevel(): LogLevel {
  const env = process.env.LOG_LEVEL as LogLevel | undefined;
  if (env && env in LOG_LEVEL_ORDER) return env;
  return process.env.ENVIRONMENT === "production" ? "info" : "debug";
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_ORDER[level] >= LOG_LEVEL_ORDER[getMinLevel()];
}

function formatMessage(
  level: LogLevel,
  module: string,
  message: string,
  data?: Record<string, unknown>,
): string {
  const entry: Record<string, unknown> = {
    level,
    module,
    message,
    ...(data && Object.keys(data).length > 0 ? { data } : {}),
  };
  return JSON.stringify(entry);
}

export interface Logger {
  debug: (message: string, data?: Record<string, unknown>) => void;
  info: (message: string, data?: Record<string, unknown>) => void;
  warn: (message: string, data?: Record<string, unknown>) => void;
  error: (message: string, data?: Record<string, unknown>) => void;
}

export function createLogger(module: string): Logger {
  return {
    debug(message, data) {
      if (shouldLog("debug")) console.debug(formatMessage("debug", module, message, data));
    },
    info(message, data) {
      if (shouldLog("info")) console.log(formatMessage("info", module, message, data));
    },
    warn(message, data) {
      if (shouldLog("warn")) console.warn(formatMessage("warn", module, message, data));
    },
    error(message, data) {
      if (shouldLog("error")) console.error(formatMessage("error", module, message, data));
    },
  };
}
