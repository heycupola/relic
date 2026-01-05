const LOG_FILE = `${process.cwd()}/debug.log`;

export async function debugLog(...args: unknown[]): Promise<void> {
  const timestamp = new Date().toISOString();
  const message = args
    .map((arg) => (typeof arg === "object" ? JSON.stringify(arg) : String(arg)))
    .join(" ");

  const logLine = `[${timestamp}] ${message}\n`;
  const file = Bun.file(LOG_FILE);
  const existingContent = (await file.exists()) ? await file.text() : "";
  await Bun.write(LOG_FILE, existingContent + logLine);
}
