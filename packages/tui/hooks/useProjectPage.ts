import { api } from "@repo/backend";
import { createLogger } from "@repo/logger";
import { useQuery } from "convex/react";
import { useCallback, useEffect, useState } from "react";
import { getProtectedApi } from "../api";
import { useUser } from "../context";
import { useUserKeys } from "../convex/hooks/useUserKeys";
import type { ProjectStatus } from "../types/models";
import { useEnvironments } from "./useEnvironments";
import { useProject } from "./useProject";
import { type ProjectKeySource, useSecrets } from "./useSecrets";
import { useSharing } from "./useSharing";

const logger = createLogger("tui");

function useLiveProjectStatus(projectId: string): ProjectStatus | null {
  const owned = useQuery(api.project.listUserProjects);
  const shared = useQuery(api.projectShare.listActiveSharedProjectsForCurrentUser);
  const ownedStatus = owned?.projects.find((p) => p.id === projectId)?.status;
  const sharedStatus = shared?.shares.find((s) => s.projectId === projectId)?.status;
  return ownedStatus ?? sharedStatus ?? null;
}

export function useProjectPage(projectId: string) {
  const { user } = useUser();
  const { encryptedPrivateKey, salt } = useUserKeys();
  const [projectKey, setProjectKey] = useState<ProjectKeySource | null>(null);
  const [projectKeyError, setProjectKeyError] = useState<string | null>(null);
  const [keyReloadCount, setKeyReloadCount] = useState(0);
  const liveStatus = useLiveProjectStatus(projectId);

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
    error: environmentsError,
    refetch: refetchEnvironments,
    create: createEnv,
    update: updateEnv,
    remove: removeEnv,
  } = useEnvironments(projectId);

  // NOTE: Owners use project.encryptedProjectKey (encrypted with their public key).
  // Shared users must fetch from their share record (encrypted with their public key).
  const isOwner = project && user ? project.ownerId === user.id : false;
  const ownerEncryptedKey = project?.encryptedProjectKey;
  const keyVersion = project?.keyVersion;
  const hasProject = project !== null;
  const userId = user?.id;

  useEffect(() => {
    if (!hasProject || !userId || keyVersion === undefined) return;
    let cancelled = false;

    const fetchProjectKey = async () => {
      if (isOwner && ownerEncryptedKey) {
        setProjectKey({ encryptedProjectKey: ownerEncryptedKey, keyVersion });
        setProjectKeyError(null);
        return;
      }
      try {
        const api = getProtectedApi();
        await api.ensureAuth();
        const share = await api.getProjectShare(projectId);
        if (cancelled) return;
        setProjectKey(
          share?.encryptedProjectKey
            ? { encryptedProjectKey: share.encryptedProjectKey, keyVersion }
            : null,
        );
        setProjectKeyError(share?.encryptedProjectKey ? null : "Project key not found");
      } catch (error) {
        if (cancelled) return;
        logger.error("Failed to get project share:", error);
        setProjectKey(null);
        setProjectKeyError("Couldn't load the project key");
      }
    };

    void fetchProjectKey();
    return () => {
      cancelled = true;
    };
  }, [hasProject, userId, isOwner, ownerEncryptedKey, keyVersion, projectId, keyReloadCount]);

  const reloadProjectKey = useCallback(() => setKeyReloadCount((n) => n + 1), []);

  const {
    folders,
    secrets,
    loadedEnvironmentId,
    isLoading: isLoadingSecrets,
    error: secretsError,
    loadEnvironment,
    clearEnvironment,
    decryptSecrets,
    createFolder,
    updateFolder,
    deleteFolder,
    createSecret,
    updateSecret,
    updateSecretBulk,
    deleteSecret,
  } = useSecrets(projectKey, encryptedPrivateKey, salt, reloadProjectKey);

  const { shareProject, revokeShare, revokeShareWithRotation } = useSharing(
    projectId,
    projectKey,
    encryptedPrivateKey,
    salt,
    shareLimits,
  );

  const isLoading = isLoadingProject || isLoadingEnvs || isLoadingSecrets;

  return {
    project,
    isOwner,
    liveStatus,
    projectKey,
    projectKeyError,
    environments,
    environmentsError,
    refetchEnvironments,
    folders,
    secrets,
    loadedEnvironmentId,
    secretsError,
    isLoadingProject,
    isLoadingEnvs,
    isLoadingSecrets,
    sharedUsers,
    shareLimits,
    isLoading,
    refetchProject,
    reloadProjectKey,
    loadEnvironment,
    clearEnvironment,
    decryptSecrets,
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
