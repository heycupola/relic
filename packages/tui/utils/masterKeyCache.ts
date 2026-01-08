import { deriveKeyFromPassword } from "@repo/crypto";
import { logger } from "./debugLog";

interface CachedMasterKey {
  key: CryptoKey;
  salt: string;
  passwordHash: string;
}

let cachedMasterKey: CachedMasterKey | null = null;

function hashPassword(password: string): string {
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

export async function getMasterKey(
  password: string | null,
  salt: string | null,
): Promise<CryptoKey | null> {
  if (!password || !salt) {
    logger.debug("No password or salt provided, cannot derive master key");
    return null;
  }

  const passwordHash = hashPassword(password);

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

export function isMasterKeyCached(password: string | null, salt: string | null): boolean {
  if (!cachedMasterKey || !password || !salt) {
    return false;
  }
  const passwordHash = hashPassword(password);
  return cachedMasterKey.salt === salt && cachedMasterKey.passwordHash === passwordHash;
}
