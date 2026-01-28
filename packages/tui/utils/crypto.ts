import {
  decryptSecret,
  deriveKeyFromPassword,
  encryptSecret,
  unwrapProjectKey,
} from "@repo/crypto";
import { logger } from "./debugLog";

interface CachedMasterKey {
  key: CryptoKey;
  salt: string;
  passwordHash: string;
}

let cachedMasterKey: CachedMasterKey | null = null;

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function getMasterKey(
  password: string | null,
  salt: string | null,
): Promise<CryptoKey | null> {
  if (!password || !salt) {
    logger.debug("No password or salt provided");
    return null;
  }

  const passwordHash = await hashPassword(password);

  if (
    cachedMasterKey &&
    cachedMasterKey.salt === salt &&
    cachedMasterKey.passwordHash === passwordHash
  ) {
    logger.debug("Using cached master key");
    return cachedMasterKey.key;
  }

  logger.debug("Deriving new master key");
  try {
    const masterKey = await deriveKeyFromPassword(password, salt);
    cachedMasterKey = { key: masterKey, salt, passwordHash };
    return masterKey;
  } catch (error) {
    logger.error("Failed to derive master key:", error);
    return null;
  }
}

export function clearMasterKeyCache(): void {
  logger.debug("Clearing master key cache");
  cachedMasterKey = null;
}

export async function isMasterKeyCached(
  password: string | null,
  salt: string | null,
): Promise<boolean> {
  if (!cachedMasterKey || !password || !salt) return false;
  const passwordHash = await hashPassword(password);
  return cachedMasterKey.salt === salt && cachedMasterKey.passwordHash === passwordHash;
}

export class ProjectKeyError extends Error {
  constructor(
    message: string,
    public readonly code: "NO_PASSWORD" | "DECRYPTION_FAILED" | "UNKNOWN",
    public readonly originalError?: Error,
  ) {
    super(message);
    this.name = "ProjectKeyError";
  }
}

export async function getProjectKey(
  encryptedProjectKey: string,
  userEncryptedPrivateKey: string,
  userSalt: string,
): Promise<CryptoKey> {
  const { getPasswordFromStorage } = await import("@repo/auth");
  const password = await getPasswordFromStorage();
  if (!password) {
    throw new ProjectKeyError(
      "No password available. Please unlock your password to access secrets.",
      "NO_PASSWORD",
    );
  }

  try {
    return await unwrapProjectKey(encryptedProjectKey, userEncryptedPrivateKey, password, userSalt);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (errorMessage.includes("DECRYPTION_FAILED") || errorMessage.includes("incorrect password")) {
      throw new ProjectKeyError(
        "Failed to decrypt project key. The stored password may be incorrect or your keys may have been rotated.",
        "DECRYPTION_FAILED",
        error instanceof Error ? error : new Error(String(error)),
      );
    }

    throw new ProjectKeyError(
      `Failed to unwrap project key: ${errorMessage}`,
      "UNKNOWN",
      error instanceof Error ? error : new Error(String(error)),
    );
  }
}

export async function encryptSecretValue(projectKey: CryptoKey, value: string): Promise<string> {
  return await encryptSecret(projectKey, value);
}

export async function decryptSecretValue(
  projectKey: CryptoKey,
  encryptedValue: string,
): Promise<string> {
  return await decryptSecret(projectKey, encryptedValue);
}
