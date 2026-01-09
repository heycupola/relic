import { deriveKeyFromPassword } from "@repo/crypto";
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
    logger.debug("No password or salt provided, cannot derive master key");
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

  logger.debug("Deriving new master key (cache miss or invalid)");
  try {
    const masterKey = await deriveKeyFromPassword(password, salt);
    cachedMasterKey = {
      key: masterKey,
      salt,
      passwordHash,
    };
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
  if (!cachedMasterKey || !password || !salt) {
    return false;
  }
  const passwordHash = await hashPassword(password);
  return cachedMasterKey.salt === salt && cachedMasterKey.passwordHash === passwordHash;
}
