import { useEffect, useState } from "react";
import { getProtectedApi } from "../api";
import { useUserKeys } from "../convex/hooks/useUserKeys";
import { logger } from "../utils/debugLog";
import { useEnvironments } from "./useEnvironments";
import { useProject } from "./useProject";
import { useSecrets } from "./useSecrets";
import { useSharing } from "./useSharing";

export function useProjectPage(projectId: string) {
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

  useEffect(() => {
    const fetchProjectKey = async () => {
      if (project?.encryptedProjectKey) {
        setEncryptedProjectKey(project.encryptedProjectKey);
      } else {
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

    if (project) {
      fetchProjectKey();
    }
  }, [project, projectId]);

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
