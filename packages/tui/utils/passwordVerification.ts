import { decryptPrivateKeyWithPassword } from "@repo/crypto";
import { logger } from "./debugLog";

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
