import { getPasswordFromStorage } from "@repo/auth";
import { decryptSecret, unwrapProjectKey } from "@repo/crypto";

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
  const password = await getPasswordFromStorage();
  if (!password) {
    throw new ProjectKeyError(
      "No password available. Run 'relic login' and set up your password first.",
      "NO_PASSWORD",
    );
  }

  try {
    return await unwrapProjectKey(encryptedProjectKey, userEncryptedPrivateKey, password, userSalt);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (errorMessage.includes("DECRYPTION_FAILED") || errorMessage.includes("incorrect password")) {
      throw new ProjectKeyError(
        "Failed to decrypt project key. Your stored password may be incorrect.",
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

export async function decryptSecretValue(
  projectKey: CryptoKey,
  encryptedValue: string,
): Promise<string> {
  return await decryptSecret(projectKey, encryptedValue);
}

export interface DecryptedSecret {
  key: string;
  value: string;
}

export async function decryptSecrets(
  projectKey: CryptoKey,
  secrets: Array<{ key: string; encryptedValue: string }>,
): Promise<DecryptedSecret[]> {
  const decrypted: DecryptedSecret[] = [];

  for (const secret of secrets) {
    try {
      const value = await decryptSecretValue(projectKey, secret.encryptedValue);
      decrypted.push({ key: secret.key, value });
    } catch (error) {
      throw new Error(`Failed to decrypt secret "${secret.key}": ${error}`);
    }
  }

  return decrypted;
}
