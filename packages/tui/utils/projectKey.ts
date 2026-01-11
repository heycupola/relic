import { decryptSecret, encryptSecret, unwrapProjectKey } from "@repo/crypto";
import { getPasswordFromStorage } from "./passwordStorage";

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

/**
 * Unwraps project key from encryptedProjectKey using user credentials (RSA unwrap)
 */
export async function getProjectKey(
  encryptedProjectKey: string,
  userEncryptedPrivateKey: string,
  userSalt: string,
): Promise<CryptoKey> {
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
        "Failed to decrypt project key. The stored password may be incorrect or your keys may have been rotated. Please verify your password.",
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

/**
 * Encrypts a secret value using project key
 */
export async function encryptSecretValue(projectKey: CryptoKey, value: string): Promise<string> {
  return await encryptSecret(projectKey, value);
}

/**
 * Decrypts a secret value using project key
 */
export async function decryptSecretValue(
  projectKey: CryptoKey,
  encryptedValue: string,
): Promise<string> {
  return await decryptSecret(projectKey, encryptedValue);
}
