import {
  createProjectKey,
  decryptSecret,
  encryptSecret,
  importPublicKey,
  wrapAESKeyWithRSA,
} from "@repo/crypto";
import { useCallback } from "react";
import { getProtectedApi } from "../api";
import type { SharedUser, ShareLimits, ShareProjectResult } from "../types/api";
import { getProjectKey } from "../utils/crypto";

export function useSharing(
  projectId: string,
  encryptedProjectKeySource: string | null,
  encryptedPrivateKey: string | null,
  salt: string | null,
  shareLimits: ShareLimits | null,
) {
  const shareProject = useCallback(
    async (email: string, confirmPayment?: boolean): Promise<ShareProjectResult> => {
      const api = getProtectedApi();
      await api.ensureAuth();

      if (!shareLimits?.hasPro) {
        return await api.shareProject({
          projectId,
          userEmail: email,
          encryptedProjectKey: "",
          confirmPayment,
        });
      }

      const collaboratorKeyResult = await api.getUserPublicKeyByEmail(email);
      if (!collaboratorKeyResult) {
        return { success: false, message: "User not found or hasn't set up their account yet" };
      }

      if (!encryptedProjectKeySource || !encryptedPrivateKey || !salt) {
        return { success: false, message: "Cannot share project: Project key not available" };
      }

      const projectKey = await getProjectKey(encryptedProjectKeySource, encryptedPrivateKey, salt);
      const collaboratorPublicKey = await importPublicKey(collaboratorKeyResult.publicKey);
      const encryptedProjectKey = await wrapAESKeyWithRSA(projectKey, collaboratorPublicKey);

      return await api.shareProject({
        projectId,
        userEmail: email,
        encryptedProjectKey,
        confirmPayment,
      });
    },
    [projectId, encryptedProjectKeySource, encryptedPrivateKey, salt, shareLimits],
  );

  const revokeShare = useCallback(async (shareId: string) => {
    const api = getProtectedApi();
    await api.ensureAuth();
    await api.revokeShare(shareId);
  }, []);

  const revokeShareWithRotation = useCallback(
    async (shareId: string, sharedUsers: SharedUser[]) => {
      if (!encryptedProjectKeySource || !encryptedPrivateKey || !salt) {
        throw new Error("Cannot rotate: Missing keys");
      }

      const api = getProtectedApi();
      await api.ensureAuth();

      const currentProjectKey = await getProjectKey(
        encryptedProjectKeySource,
        encryptedPrivateKey,
        salt,
      );
      const currentUser = await api.getCurrentUser();
      if (!currentUser.publicKey) throw new Error("Current user has no public key");

      const { encryptedProjectKey: newEncryptedProjectKey, projectKey: newProjectKey } =
        await createProjectKey(currentUser.publicKey);

      const allSecrets = await api.getAllSecretsForProject(projectId);
      const reEncryptedSecrets = await Promise.all(
        allSecrets.map(async (secret) => ({
          secretId: secret.id,
          newEncryptedValue: await encryptSecret(
            newProjectKey,
            await decryptSecret(currentProjectKey, secret.encryptedValue),
          ),
        })),
      );

      const remainingShares = sharedUsers.filter((u) => u.id !== shareId);
      const rewrappedShares = await Promise.all(
        remainingShares
          .filter((s): s is SharedUser & { publicKey: string } => s.publicKey !== null)
          .map(async (s) => ({
            shareId: s.id,
            newEncryptedProjectKey: await wrapAESKeyWithRSA(
              newProjectKey,
              await importPublicKey(s.publicKey),
            ),
          })),
      );

      const MAX_RETRIES = 3;
      for (let i = 0; i < MAX_RETRIES; i++) {
        try {
          await api.revokeShareWithRotation({
            shareId,
            newEncryptedProjectKey,
            rewrappedShares,
            reEncryptedSecrets,
          });
          return;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          const errorLower = errorMessage.toLowerCase();
          const isTerminal =
            errorLower.includes("not found") ||
            errorLower.includes("invalid") ||
            errorLower.includes("already revoked");
          if (i === MAX_RETRIES - 1 || isTerminal) {
            throw error;
          }
          await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** i));
        }
      }
    },
    [projectId, encryptedProjectKeySource, encryptedPrivateKey, salt],
  );

  return { shareProject, revokeShare, revokeShareWithRotation };
}
