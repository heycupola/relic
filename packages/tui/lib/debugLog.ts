import { appendFileSync } from "fs";
import { join } from "path";

const LOG_FILE = join(process.cwd(), "debug.log");

export function debugLog(...args: unknown[]): void {
    const timestamp = new Date().toISOString();
    const message = args.map(arg =>
        typeof arg === "object" ? JSON.stringify(arg) : String(arg)
    ).join(" ");

    appendFileSync(LOG_FILE, `[${timestamp}] ${message}\n`);
}
