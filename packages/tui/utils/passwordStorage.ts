import { secrets } from "bun";
import { unlink } from "node:fs/promises";

// NOTE: The password is stored in the OS keychain on macOS, Windows, and Linux.
// As a fallback, the password is stored in a file in the user's home directory.

const SECRETS_SERVICE = "com.relic.tui";
const SECRETS_NAME = "master-password";
const PASSWORD_FILE = `${Bun.env.HOME}/.relic_password`;

async function getPasswordFromStorage(): Promise<string | null> {
  try {
    const password = await secrets.get({
      service: SECRETS_SERVICE,
      name: SECRETS_NAME,
    });
    if (password !== null && password.length > 0) {
      return password;
    }
  } catch {}

  try {
    const file = Bun.file(PASSWORD_FILE);
    if (await file.exists()) {
      const password = await file.text();
      return password.length > 0 ? password : null;
    }
  } catch {}

  return null;
}

async function savePasswordToStorage(password: string): Promise<void> {
  try {
    await secrets.set({
      service: SECRETS_SERVICE,
      name: SECRETS_NAME,
      value: password,
    });
    try {
      const file = Bun.file(PASSWORD_FILE);
      if (await file.exists()) {
        await unlink(PASSWORD_FILE);
      }
    } catch {}
    return;
  } catch {}

  try {
    await Bun.write(PASSWORD_FILE, password);
  } catch (error) {
    throw new Error(`Failed to save password: ${error}`);
  }
}

async function deletePasswordFromStorage(): Promise<void> {
  try {
    await secrets.delete({
      service: SECRETS_SERVICE,
      name: SECRETS_NAME,
    });
  } catch {}

  try {
    const file = Bun.file(PASSWORD_FILE);
    if (await file.exists()) {
      await unlink(PASSWORD_FILE);
    }
  } catch {}
}

export async function hasPassword(): Promise<boolean> {
  const password = await getPasswordFromStorage();
  return password !== null && password.length > 0;
}

export async function savePassword(password: string): Promise<void> {
  await savePasswordToStorage(password);
}

export async function verifyPassword(password: string): Promise<boolean> {
  const stored = await getPasswordFromStorage();
  return stored !== null && stored === password;
}

export async function clearPassword(): Promise<void> {
  await deletePasswordFromStorage();
}
