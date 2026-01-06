import { resolve } from "node:path";

const LOG_FILE_PATH = resolve(import.meta.dir, "..", "debug.log");
const logFile = Bun.file(LOG_FILE_PATH);

let writer: ReturnType<typeof logFile.writer> | null = null;

// Export originals for direct use when needed (initialized in initLogger)
export const originalConsole = {
  log: console.log,
  error: console.error,
  warn: console.warn,
  info: console.info,
  debug: console.debug,
};

function serialize(obj: unknown, indent = 2): string {
  const cache = new Set();

  return JSON.stringify(
    obj,
    (_key, value) => {
      if (typeof value === "object" && value !== null) {
        if (cache.has(value)) {
          return "[Circular]";
        }
        cache.add(value);
      }
      if (value instanceof Error) {
        return {
          message: value.message,
          stack: value.stack,
          name: value.name,
        };
      }
      return value;
    },
    indent,
  );
}

function formatArgs(args: unknown[]): string {
  return args
    .map((arg) => {
      if (typeof arg === "string") return arg;
      if (arg === undefined) return "undefined";
      if (arg === null) return "null";
      try {
        return serialize(arg);
      } catch (e) {
        return `[Serialization Error: ${String(e)}]`;
      }
    })
    .join(" ");
}

export async function debugLog(...args: unknown[]): Promise<void> {
  const timestamp = new Date().toISOString();
  const message = formatArgs(args);
  const logLine = `[${timestamp}] ${message}\n`;

  try {
    if (!writer) {
      writer = logFile.writer();
    }
    writer.write(logLine);
    writer.flush();
  } catch (_err) {
    // Fallback to console.error but only if we are not in a loop
    // Since we override console.error, we should be careful.
    // However, if Bun FS fails, we might just have to swallow it.
  }
}

export async function initLogger() {
  try {
    await Bun.write(LOG_FILE_PATH, "");
    writer = logFile.writer({ highWaterMark: 1024 * 1024 });

    await debugLog("Logger initialized. Using Bun FS APIs.");
  } catch (_err) {
    // Ignore initialization errors
  }

  // Capture originals before overriding
  originalConsole.log = console.log;
  originalConsole.error = console.error;
  originalConsole.warn = console.warn;
  originalConsole.info = console.info;
  originalConsole.debug = console.debug;

  const handleLog = (level: string, ...args: unknown[]) => {
    debugLog(`[${level}]`, ...args);
  };

  console.log = (...args) => handleLog("LOG", ...args);
  console.error = (...args) => handleLog("ERROR", ...args);
  console.warn = (...args) => handleLog("WARN", ...args);
  console.info = (...args) => handleLog("INFO", ...args);
  console.debug = (...args) => handleLog("DEBUG", ...args);

  process.on("exit", () => {
    if (writer) {
      writer.end();
    }
  });

  process.on("uncaughtException", (error) => {
    debugLog("UNCAUGHT EXCEPTION:", error);
    if (writer) {
      writer.end();
    }
    process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    debugLog("UNHANDLED REJECTION:", reason);
  });
}
