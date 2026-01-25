import { unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { decryptPrivateKeyWithPassword } from "@repo/crypto";
import { secrets } from "bun";
import { clearMasterKeyCache } from "./crypto";
import { logger } from "./debugLog";
import { ensureRelicDir, RELIC_PASSWORD_FILE } from "./paths";

const SECRETS_SERVICE = "com.relic.tui";
const SECRETS_NAME = "master-password";
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
          // Ignore - file may not exist
        }
        logger.log("Migrated password from legacy location");
      }
    }
  } catch (error) {
    logger.error("Failed to migrate legacy password:", error);
  }
}

export async function getPasswordFromStorage(): Promise<string | null> {
  try {
    const password = await secrets.get({ service: SECRETS_SERVICE, name: SECRETS_NAME });
    if (password !== null && password.length > 0) return password;
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
    await secrets.set({ service: SECRETS_SERVICE, name: SECRETS_NAME, value: password });
    try {
      const file = Bun.file(RELIC_PASSWORD_FILE);
      if (await file.exists()) await unlink(RELIC_PASSWORD_FILE);
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
    await secrets.delete({ service: SECRETS_SERVICE, name: SECRETS_NAME });
  } catch (error) {
    logger.debug("Keychain delete failed:", error);
  }

  try {
    const file = Bun.file(RELIC_PASSWORD_FILE);
    if (await file.exists()) await unlink(RELIC_PASSWORD_FILE);
  } catch (error) {
    logger.debug("Failed to delete password file:", error);
  }

  try {
    const legacyFile = Bun.file(LEGACY_PASSWORD_FILE);
    if (await legacyFile.exists()) await unlink(LEGACY_PASSWORD_FILE);
  } catch {
    // Ignore - file may not exist
  }
}

export async function hasPassword(): Promise<boolean> {
  const password = await getPasswordFromStorage();
  return password !== null && password.length > 0;
}

export async function savePassword(password: string): Promise<void> {
  await savePasswordToStorage(password);
  clearMasterKeyCache();
}

export async function verifyPassword(password: string): Promise<boolean> {
  const stored = await getPasswordFromStorage();
  return stored !== null && stored === password;
}

export async function clearPassword(): Promise<void> {
  await deletePasswordFromStorage();
  clearMasterKeyCache();
}

export interface PasswordValidationResult {
  isValid: boolean;
  errors: string[];
  strength: "weak" | "medium" | "strong";
  strengthScore: number;
}

export interface PasswordRequirement {
  id: string;
  label: string;
  met: boolean;
}

const MIN_PASSWORD_LENGTH = 8;

export function checkPasswordRequirements(password: string): PasswordRequirement[] {
  return [
    {
      id: "length",
      label: `At least ${MIN_PASSWORD_LENGTH} characters`,
      met: password.length >= MIN_PASSWORD_LENGTH,
    },
    { id: "uppercase", label: "One uppercase letter", met: /[A-Z]/.test(password) },
    { id: "lowercase", label: "One lowercase letter", met: /[a-z]/.test(password) },
    { id: "number", label: "One number", met: /[0-9]/.test(password) },
    {
      id: "special",
      label: "One special character (!@#$%^&*...)",
      met: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(password),
    },
  ];
}

function calculateStrength(requirements: PasswordRequirement[]): {
  strength: "weak" | "medium" | "strong";
  score: number;
} {
  const metCount = requirements.filter((r) => r.met).length;
  if (metCount <= 2) return { strength: "weak", score: metCount };
  if (metCount <= 4) return { strength: "medium", score: metCount };
  return { strength: "strong", score: metCount };
}

export function validatePassword(password: string): PasswordValidationResult {
  const requirements = checkPasswordRequirements(password);
  const { strength, score } = calculateStrength(requirements);

  if (password.length === 0) {
    return { isValid: false, errors: ["Password is required"], strength, strengthScore: score };
  }

  const unmetRequirements = requirements.filter((r) => !r.met);
  const isValid = unmetRequirements.length === 0;
  const errors = unmetRequirements.map((r) => r.label);

  return { isValid, errors, strength, strengthScore: score };
}

export function passwordsMatch(password: string, confirmPassword: string): boolean {
  return password === confirmPassword && password.length > 0;
}

export function getStrengthIndicator(score: number): string {
  return "●".repeat(score) + "○".repeat(5 - score);
}

export function getStrengthColor(strength: "weak" | "medium" | "strong"): string {
  switch (strength) {
    case "weak":
      return "#f7768e";
    case "medium":
      return "#e0af68";
    case "strong":
      return "#9ece6a";
  }
}

export async function verifyPasswordWithExistingKeys(
  newPassword: string,
  encryptedPrivateKey: string,
  salt: string,
): Promise<boolean> {
  try {
    await decryptPrivateKeyWithPassword(encryptedPrivateKey, newPassword, salt);
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes("DECRYPTION_FAILED")) {
      logger.debug("Password verification failed: incorrect password");
      return false;
    }
    logger.error("Unexpected error during password verification:", error);
    return false;
  }
}
