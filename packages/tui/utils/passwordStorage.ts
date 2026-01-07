import { unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { secrets } from "bun";
import { logger } from "./debugLog";
import { ensureRelicDir, RELIC_PASSWORD_FILE } from "./paths";

const SECRETS_SERVICE = "com.relic.tui";
const SECRETS_NAME = "master-password";
// Cross-platform legacy password file location
const HOME = process.env.HOME || process.env.USERPROFILE || "~";
const LEGACY_PASSWORD_FILE = resolve(HOME, ".relic_password");

async function migrateLegacyPassword(): Promise<void> {
  try {
    const legacyFile = Bun.file(LEGACY_PASSWORD_FILE);
    if (await legacyFile.exists()) {
      const password = await legacyFile.text();
      if (password.length > 0) {
        await ensureRelicDir();
        await Bun.write(RELIC_PASSWORD_FILE, password);
        try {
          await unlink(LEGACY_PASSWORD_FILE);
        } catch {
          // Ignore if file doesn't exist
        }
        logger.log("Migrated password from legacy location to ~/.relic/password");
      }
    }
  } catch (error) {
    logger.error("Failed to migrate legacy password:", error);
  }
}

async function getPasswordFromStorage(): Promise<string | null> {
  try {
    const password = await secrets.get({
      service: SECRETS_SERVICE,
      name: SECRETS_NAME,
    });
    if (password !== null && password.length > 0) {
      return password;
    }
  } catch (error) {
    logger.debug("Keychain access failed:", error);
  }

  await migrateLegacyPassword();

  try {
    const file = Bun.file(RELIC_PASSWORD_FILE);
    if (await file.exists()) {
      const password = await file.text();
      return password.length > 0 ? password : null;
    }
  } catch (error) {
    logger.debug("File system access failed:", error);
  }

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
      const file = Bun.file(RELIC_PASSWORD_FILE);
      if (await file.exists()) {
        await unlink(RELIC_PASSWORD_FILE);
      }
    } catch (error) {
      logger.debug("Failed to remove fallback password file:", error);
    }
    return;
  } catch (error) {
    logger.debug("Keychain save failed:", error);
  }

  try {
    await ensureRelicDir();
    await Bun.write(RELIC_PASSWORD_FILE, password);
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
  } catch (error) {
    logger.debug("Keychain delete failed:", error);
  }

  try {
    const file = Bun.file(RELIC_PASSWORD_FILE);
    if (await file.exists()) {
      await Bun.$`rm ${RELIC_PASSWORD_FILE}`.quiet();
    }
  } catch (error) {
    logger.debug("Failed to delete password file:", error);
  }

  try {
    const legacyFile = Bun.file(LEGACY_PASSWORD_FILE);
    if (await legacyFile.exists()) {
      await unlink(LEGACY_PASSWORD_FILE);
    }
  } catch (_) {
    return;
  }
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
