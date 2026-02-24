import { createLogger } from "@repo/logger";
import { useEffect, useState } from "react";
import { getProtectedApi } from "../api";
import { useUser } from "../context";
import { useUserKeys } from "../convex/hooks/useUserKeys";

const logger = createLogger("tui");

import { useEnvironments } from "./useEnvironments";
import { useProject } from "./useProject";
import { useSecrets } from "./useSecrets";
import { useSharing } from "./useSharing";

export function useProjectPage(projectId: string) {
  const { user } = useUser();
  const { encryptedPrivateKey, salt } = useUserKeys();
  const [encryptedProjectKey, setEncryptedProjectKey] = useState<string | null>(null);

  const {
    project,
    sharedUsers,
    shareLimits,
    isLoading: isLoadingProject,
    refetch: refetchProject,
  } = useProject(projectId);

  const {
    environments,
    isLoading: isLoadingEnvs,
    create: createEnv,
    update: updateEnv,
    remove: removeEnv,
  } = useEnvironments(projectId);

  // NOTE: Owners use project.encryptedProjectKey (encrypted with their public key).
  // Shared users must fetch from their share record (encrypted with their public key).
  const isOwner = project && user ? project.ownerId === user.id : false;

  useEffect(() => {
    const fetchProjectKey = async () => {
      if (isOwner && project?.encryptedProjectKey) {
        // Owner: use the project's encrypted key (encrypted with owner's public key)
        setEncryptedProjectKey(project.encryptedProjectKey);
      } else {
        // Shared user: fetch from share record (encrypted with their public key)
        try {
          const api = getProtectedApi();
          await api.ensureAuth();
          const share = await api.getProjectShare(projectId);
          if (share?.encryptedProjectKey) {
            setEncryptedProjectKey(share.encryptedProjectKey);
          } else {
            setEncryptedProjectKey(null);
          }
        } catch (error) {
          logger.error("Failed to get project share:", error);
          setEncryptedProjectKey(null);
        }
      }
    };

    if (project && user) {
      fetchProjectKey();
    }
  }, [project, projectId, user, isOwner]);

  const {
    folders,
    secrets,
    isLoading: isLoadingSecrets,
    loadEnvironment,
    createFolder,
    updateFolder,
    deleteFolder,
    createSecret,
    updateSecret,
    updateSecretBulk,
    deleteSecret,
  } = useSecrets(projectId, encryptedProjectKey, encryptedPrivateKey, salt);

  const { shareProject, revokeShare, revokeShareWithRotation } = useSharing(
    projectId,
    encryptedProjectKey,
    encryptedPrivateKey,
    salt,
    shareLimits,
  );

  const isLoading = isLoadingProject || isLoadingEnvs || isLoadingSecrets;

  return {
    project,
    environments,
    folders,
    secrets,
    sharedUsers,
    shareLimits,
    isLoading,
    refetchProject,
    loadEnvironment,
    createEnv,
    updateEnv,
    removeEnv,
    createFolder,
    updateFolder,
    deleteFolder,
    createSecret,
    updateSecret,
    updateSecretBulk,
    deleteSecret,
    shareProject,
    revokeShare,
    revokeShareWithRotation,
  };
}
