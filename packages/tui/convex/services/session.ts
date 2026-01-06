import { chmod, mkdir, unlink } from "node:fs/promises";
import type { Session, SessionValidation } from "../types";

const CONFIG_DIR = `${Bun.env.HOME}/.config/relic`;
const SESSION_FILE = `${CONFIG_DIR}/session.json`;

async function ensureConfigDir(): Promise<void> {
  try {
    await mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
    // Ensure permissions on Unix-like systems (no-op on Windows)
    if (process.platform !== "win32") {
      await chmod(CONFIG_DIR, 0o700);
    }
  } catch {
    // ignore - directory may already exist
  }
}

export async function saveSession(session: Session): Promise<void> {
  await ensureConfigDir();
  const data = JSON.stringify(session, null, 2);
  await Bun.write(SESSION_FILE, data);
}

export async function loadSession(): Promise<Session | null> {
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
  } catch {
    // ignore
  }
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
  const bufferTime = 60 * 1000; // 1 minute buffer before expiry
  if (session.jwtExpiresAt - bufferTime < now) {
    return null; // JWT expired or about to expire
  }

  return session.jwtToken;
}
