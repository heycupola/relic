import {
  createProjectKey,
  decryptSecret,
  encryptSecret,
  importPublicKey,
  wrapAESKeyWithRSA,
} from "@repo/crypto";
import type { SecretHistoryForRotation, ServiceAccount, SharedUser } from "../types/api";
import { reEncryptHistoryEntries } from "./history";

export interface RotationInput {
  revokedShareId: string;
  currentProjectKey: CryptoKey;
  ownerPublicKey: string;
  shares: Array<Pick<SharedUser, "id" | "email" | "publicKey">>;
  serviceAccounts: ServiceAccount[];
  secrets: Array<{ id: string; encryptedValue: string }>;
  history?: SecretHistoryForRotation[];
}

export interface RotationPayload {
  newEncryptedProjectKey: string;
  rewrappedShares: Array<{ shareId: string; newEncryptedProjectKey: string }>;
  reEncryptedSecrets: Array<{ secretId: string; newEncryptedValue: string }>;
  rewrappedServiceAccounts: Array<{ serviceAccountId: string; newEncryptedProjectKey: string }>;
  reEncryptedHistory: Array<{ historyId: string; newEncryptedValue: string }>;
}

export async function wrapProjectKeyFor(projectKey: CryptoKey, publicKey: string): Promise<string> {
  return await wrapAESKeyWithRSA(projectKey, await importPublicKey(publicKey));
}

/**
 * The server rejects a rotation unless every remaining share, active service account, and secret
 * is included. History entries that can't be re-encrypted are dropped; the server deletes them.
 */
export async function buildRotationPayload({
  revokedShareId,
  currentProjectKey,
  ownerPublicKey,
  shares,
  serviceAccounts,
  secrets,
  history = [],
}: RotationInput): Promise<RotationPayload> {
  const remainingShares = shares.filter((s) => s.id !== revokedShareId);
  const sharesWithoutKeys = remainingShares.filter((s) => !s.publicKey);
  if (sharesWithoutKeys.length > 0) {
    const emails = sharesWithoutKeys.map((s) => s.email).join(", ");
    const verb = sharesWithoutKeys.length === 1 ? "has" : "have";
    throw new Error(
      `Cannot rotate keys: ${emails} ${verb} no encryption keys yet. Revoke them first or ask them to finish setup.`,
    );
  }
  const sharesWithKeys = remainingShares.flatMap((s) =>
    s.publicKey ? [{ id: s.id, publicKey: s.publicKey }] : [],
  );

  const { encryptedProjectKey: newEncryptedProjectKey, projectKey: newProjectKey } =
    await createProjectKey(ownerPublicKey);

  const [reEncryptedSecrets, rewrappedShares, rewrappedServiceAccounts, reEncryptedHistory] =
    await Promise.all([
      Promise.all(
        secrets.map(async (secret) => ({
          secretId: secret.id,
          newEncryptedValue: await encryptSecret(
            newProjectKey,
            await decryptSecret(currentProjectKey, secret.encryptedValue),
          ),
        })),
      ),
      Promise.all(
        sharesWithKeys.map(async (s) => ({
          shareId: s.id,
          newEncryptedProjectKey: await wrapProjectKeyFor(newProjectKey, s.publicKey),
        })),
      ),
      Promise.all(
        serviceAccounts
          .filter((sa) => sa.revokedAt === undefined)
          .map(async (sa) => ({
            serviceAccountId: sa.id,
            newEncryptedProjectKey: await wrapProjectKeyFor(newProjectKey, sa.publicKey),
          })),
      ),
      reEncryptHistoryEntries(history, currentProjectKey, newProjectKey),
    ]);

  return {
    newEncryptedProjectKey,
    rewrappedShares,
    reEncryptedSecrets,
    rewrappedServiceAccounts,
    reEncryptedHistory,
  };
}
