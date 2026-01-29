import { decryptSecret, encryptSecret, unwrapProjectKey } from "@repo/crypto";

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
