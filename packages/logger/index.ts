import { createConsola } from "consola";
import {
  getConfig,
  getConfigDir,
  getLogsDir,
  getTelemetryPreference,
  isFirstRun,
  type LoggerConfig,
  type LogLevel,
  saveTelemetryPreference,
} from "./config";
import { clearLogFile, createFileReporter } from "./transports/file";
import { captureEvent, setDistinctId, shutdown } from "./transports/posthog";

const LEVEL_MAP: Record<LogLevel, number> = {
  debug: 4,
  info: 3,
  warn: 2,
  error: 1,
  off: -1,
};

let config: LoggerConfig | null = null;
let initialized = false;
let eventLogger: ReturnType<typeof createConsola> | null = null;

function getOrInitConfig(): LoggerConfig {
  if (!config) {
    config = getConfig();
  }
  return config;
}

function getEventLogger() {
  if (!eventLogger) {
    eventLogger = createLogger("event");
  }
  return eventLogger;
}

export async function initLogger(): Promise<void> {
  if (initialized) return;
  config = getConfig();

  if (config.isDev) {
    clearLogFile(config.logFile);
  }

  process.on("beforeExit", async () => {
    if (config) await shutdown(config);
  });

  initialized = true;
}

export function createLogger(tag: string) {
  const cfg = getOrInitConfig();
  const level = LEVEL_MAP[cfg.level] ?? 3;

  if (cfg.isDev && !cfg.isCI) {
    const logger = createConsola({ level, defaults: { tag } });
    logger.addReporter(createFileReporter(cfg.logFile));
    return logger;
  }

  return createConsola({
    level,
    reporters: [createFileReporter(cfg.logFile)],
    defaults: { tag },
  });
}

export function trackEvent(event: string, properties: Record<string, unknown> = {}): void {
  const cfg = getOrInitConfig();
  captureEvent(cfg, event, properties);
  getEventLogger().info(`[${event}]`, properties);
}

export function trackError(
  source: string,
  error: unknown,
  context: Record<string, unknown> = {},
): void {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  trackEvent("error_occurred", { source, message, stack, ...context });
}

export function identifyUser(userId: string): void {
  setDistinctId(userId);
}

export async function flushTelemetry(): Promise<void> {
  const cfg = getOrInitConfig();
  await shutdown(cfg);
}

export { saveTelemetryPreference, getTelemetryPreference, isFirstRun, getConfigDir, getLogsDir };
