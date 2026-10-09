import { flushTelemetry, trackError } from "@repo/logger";

const FLUSH_TIMEOUT_MS = 2_000;

/** Reduces stack frames to file basenames so absolute paths (and usernames) are never sent. */
export function sanitizeStack(stack: string | undefined): string | undefined {
  if (!stack) return undefined;
  return stack.replace(/(?:file:\/\/)?(?:[A-Za-z]:)?[\\/][^\s():]*[\\/]([^\s\\/():]+)/g, "$1");
}

export function trackCliError(error: unknown, context: Record<string, unknown> = {}): void {
  const stack = error instanceof Error ? sanitizeStack(error.stack) : undefined;
  trackError("cli", error, { ...context, stack });
}

/** `process.exit` skips `beforeExit`, so queued telemetry must be flushed explicitly first. */
export async function exitWithTelemetry(code: number): Promise<never> {
  try {
    await Promise.race([
      flushTelemetry(),
      new Promise<void>((resolve) => setTimeout(resolve, FLUSH_TIMEOUT_MS).unref()),
    ]);
  } catch {
    // telemetry must never block or change the exit code
  }
  process.exit(code);
}
