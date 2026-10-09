import { ConvexError } from "convex/values";
import { useCallback } from "react";
import { getProtectedApi } from "../api";
import type { ShareLimits, ShareProjectResult } from "../types/api";
import { getProjectKey } from "../utils/crypto";
import { buildRotationPayload, wrapProjectKeyFor } from "../utils/keyRotation";

const MAX_ROTATION_ATTEMPTS = 3;

async function withTransientRetry(fn: () => Promise<void>): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await fn();
      return;
    } catch (error) {
      if (error instanceof ConvexError || attempt >= MAX_ROTATION_ATTEMPTS) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** (attempt - 1)));
    }
  }
}

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
      const encryptedProjectKey = await wrapProjectKeyFor(
        projectKey,
        collaboratorKeyResult.publicKey,
      );

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
    async (shareId: string) => {
      if (!encryptedProjectKeySource || !encryptedPrivateKey || !salt) {
        throw new Error("Cannot rotate: Missing keys");
      }

      const api = getProtectedApi();
      await api.ensureAuth();

      const [currentProjectKey, currentUser, { shares }, serviceAccounts, allSecrets] =
        await Promise.all([
          getProjectKey(encryptedProjectKeySource, encryptedPrivateKey, salt),
          api.getCurrentUser(),
          api.listProjectShares(projectId),
          api.listServiceAccounts(projectId),
          api.getAllSecretsForProject(projectId),
        ]);
      if (!currentUser.publicKey) throw new Error("Current user has no public key");

      const payload = await buildRotationPayload({
        revokedShareId: shareId,
        currentProjectKey,
        ownerPublicKey: currentUser.publicKey,
        shares,
        serviceAccounts,
        secrets: allSecrets,
      });

      await withTransientRetry(() => api.revokeShareWithRotation({ shareId, ...payload }));
    },
    [projectId, encryptedProjectKeySource, encryptedPrivateKey, salt],
  );

  return { shareProject, revokeShare, revokeShareWithRotation };
}
