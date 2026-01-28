import { existsSync } from "node:fs";
import { chmod, mkdir, unlink, watch } from "node:fs/promises";
import { resolve } from "node:path";
import { clearPassword } from "./password";
import type { Session, SessionValidation } from "./types";

export type SessionChangeEvent = "created" | "deleted" | "changed";

const HOME = process.env.HOME || process.env.USERPROFILE || "~";
const CONFIG_DIR =
  process.platform === "win32"
    ? resolve(HOME, "AppData", "Roaming", "relic")
    : resolve(HOME, ".config", "relic");
const SESSION_FILE = resolve(CONFIG_DIR, "session.json");

const ENV_SESSION_KEY = "RELIC_SESSION";

async function ensureConfigDir(): Promise<void> {
  try {
    await mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
    if (process.platform !== "win32") {
      await chmod(CONFIG_DIR, 0o700);
    }
  } catch (_) {
    void 0;
  }
}

export function isSessionFromEnv(): boolean {
  return !!process.env[ENV_SESSION_KEY];
}

function parseSessionFromBase64(encoded: string): Session | null {
  try {
    const decoded = Buffer.from(encoded, "base64").toString("utf-8");
    const parsed = JSON.parse(decoded) as unknown;

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as Session).sessionToken !== "string" ||
      typeof (parsed as Session).tokenType !== "string" ||
      typeof (parsed as Session).expiresAt !== "number"
    ) {
      return null;
    }

    return parsed as Session;
  } catch {
    return null;
  }
}

export async function saveSession(session: Session): Promise<void> {
  if (isSessionFromEnv()) {
    return;
  }
  await ensureConfigDir();
  const data = JSON.stringify(session, null, 2);
  await Bun.write(SESSION_FILE, data);
}

export async function loadSession(): Promise<Session | null> {
  const envSession = process.env[ENV_SESSION_KEY];
  if (envSession) {
    const session = parseSessionFromBase64(envSession);
    if (session) {
      return session;
    }
  }

  try {
    const file = Bun.file(SESSION_FILE);
    if (!(await file.exists())) {
      return null;
    }
    return await file.json();
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  try {
    const file = Bun.file(SESSION_FILE);
    if (await file.exists()) {
      await unlink(SESSION_FILE);
    }
  } catch (_) {
    void 0;
  }
  await clearPassword();
}

export async function updateSessionJwt(jwtToken: string, jwtExpiresAt: number): Promise<void> {
  const session = await loadSession();
  if (session) {
    session.jwtToken = jwtToken;
    session.jwtExpiresAt = jwtExpiresAt;
    await saveSession(session);
  }
}

export async function validateSession(): Promise<SessionValidation> {
  const session = await loadSession();

  if (!session) {
    return { isValid: false, isExpired: false, session: null };
  }

  const now = Date.now();
  const isExpired = session.expiresAt < now;

  if (isExpired) {
    await clearSession();
    return { isValid: false, isExpired: true, session: null };
  }

  return { isValid: true, isExpired: false, session };
}

export async function hasValidSession(): Promise<boolean> {
  const { isValid } = await validateSession();
  return isValid;
}

export async function getSessionToken(): Promise<string | null> {
  const { session } = await validateSession();
  return session?.sessionToken ?? null;
}

export async function getJwtToken(): Promise<string | null> {
  const { session } = await validateSession();
  if (!session?.jwtToken || !session?.jwtExpiresAt) {
    return null;
  }

  const now = Date.now();
  const bufferTime = 60 * 1000;
  if (session.jwtExpiresAt - bufferTime < now) {
    return null;
  }

  return session.jwtToken;
}

export function getConfigDir(): string {
  return CONFIG_DIR;
}

export function getSessionFilePath(): string {
  return SESSION_FILE;
}

export async function watchSession(
  callback: (event: SessionChangeEvent) => void,
): Promise<() => void> {
  if (isSessionFromEnv()) {
    // No-op cleanup when session is from env
    return () => undefined;
  }

  await ensureConfigDir();

  let previousExists = existsSync(SESSION_FILE);
  const ac = new AbortController();

  (async () => {
    try {
      const watcher = watch(CONFIG_DIR, { signal: ac.signal });
      for await (const event of watcher) {
        if (event.filename !== "session.json") continue;

        const currentExists = existsSync(SESSION_FILE);

        if (!previousExists && currentExists) {
          callback("created");
        } else if (previousExists && !currentExists) {
          callback("deleted");
        } else if (currentExists) {
          callback("changed");
        }

        previousExists = currentExists;
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).name !== "AbortError") {
        throw err;
      }
    }
  })();

  return () => ac.abort();
}
