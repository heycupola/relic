import { useCallback, useEffect, useState } from "react";
import type { Project as ApiProject } from "../convex/api/types";
import { useApi } from "../convex/hooks/useApi";
import { useUserKeys } from "../convex/hooks/useUserKeys";
import type { Environment, Folder, Secret, SharedUser } from "../types/models";
import { logger } from "../utils/debugLog";
import { mapApiEnvironment, mapApiFolder, mapApiSecret, mapApiSharedUser } from "../utils/mappers";
import {
  decryptSecretValue,
  encryptSecretValue,
  getProjectKey,
  ProjectKeyError,
} from "../utils/projectKey";

interface UseProjectDataReturn {
  project: ApiProject | null;

  environments: Environment[];

  currentEnvironmentData: {
    folders: Folder[];
    secrets: Secret[];
  } | null;

  sharedUsers: SharedUser[];

  isLoading: boolean;
  isLoadingEnvironmentData: boolean;

  error: Error | null;

  refetch: () => Promise<void>;
  loadEnvironmentData: (environmentId: string) => Promise<void>;

  createEnvironment: (name: string, color?: string) => Promise<string | undefined>;
  updateEnvironment: (environmentId: string, name: string, color?: string) => Promise<void>;
  deleteEnvironment: (environmentId: string) => Promise<void>;

  createFolder: (environmentId: string, name: string) => Promise<string | undefined>;
  updateFolder: (folderId: string, name: string) => Promise<void>;
  deleteFolder: (folderId: string) => Promise<void>;

  createSecret: (args: {
    environmentId: string;
    folderId?: string;
    key: string;
    encryptedValue: string;
    valueType?: "string" | "number" | "boolean";
    scope?: "client" | "server" | "shared";
    description?: string;
  }) => Promise<string | undefined>;
  updateSecretBulk: (args: {
    environmentId: string;
    folderId?: string;
    secrets: Array<{
      secretId?: string;
      key: string;
      encryptedValue: string;
      valueType: "string" | "number" | "boolean";
      scope?: "client" | "server" | "shared";
    }>;
    mode?: "skip" | "overwrite";
  }) => Promise<{
    success: boolean;
    updatedCount: number;
    createdCount: number;
    skippedCount: number;
    secretIds: string[];
  }>;
  updateSecret: (args: {
    secretId: string;
    key?: string;
    encryptedValue?: string;
    valueType?: "string" | "number" | "boolean";
    scope?: "client" | "server" | "shared";
    description?: string;
  }) => Promise<void>;
  deleteSecret: (secretId: string) => Promise<void>;

  shareProject: (email: string, encryptedProjectKey: string) => Promise<void>;
  revokeShare: (shareId: string) => Promise<void>;
}

export function useProjectData(projectId: string): UseProjectDataReturn {
  const { api, isLoading: isApiLoading, error: apiError } = useApi();
  const { encryptedPrivateKey, salt } = useUserKeys();

  const [project, setProject] = useState<ApiProject | null>(null);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [currentEnvironmentData, setCurrentEnvironmentData] = useState<{
    folders: Folder[];
    secrets: Secret[];
  } | null>(null);
  const [sharedUsers, setSharedUsers] = useState<SharedUser[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingEnvironmentData, setIsLoadingEnvironmentData] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Get project key for encryption/decryption
  const getProjectKeyForProject = useCallback(async (): Promise<CryptoKey | null> => {
    if (!encryptedPrivateKey || !salt || !api) {
      return null;
    }

    try {
      let encryptedProjectKey: string | null = null;

      // Try to get from project (for owned projects)
      if (project?.encryptedProjectKey) {
        encryptedProjectKey = project.encryptedProjectKey;
      } else {
        // Try to get from project share (for shared projects)
        try {
          const share = await api.getProjectShare(projectId);
          if (share?.encryptedProjectKey) {
            encryptedProjectKey = share.encryptedProjectKey;
          }
        } catch (error) {
          logger.debug("Failed to get project share:", error);
        }
      }

      if (!encryptedProjectKey) {
        logger.error("No encrypted project key available");
        return null;
      }

      return await getProjectKey(encryptedProjectKey, encryptedPrivateKey, salt);
    } catch (error) {
      if (error instanceof ProjectKeyError) {
        logger.error(`Project key error (${error.code}):`, error.message);
        setError(error);
      } else {
        logger.error("Failed to get project key:", error);
        setError(
          error instanceof Error
            ? error
            : new Error("Failed to get project key for encryption/decryption"),
        );
      }
      return null;
    }
  }, [project?.encryptedProjectKey, encryptedPrivateKey, salt, api, projectId]);

  // Fetch project and its environments
  const fetchProjectData = useCallback(async () => {
    if (!api) return;

    setIsLoading(true);
    setError(null);

    try {
      // Fetch project details
      const projectData = await api.getProject(projectId);
      setProject(projectData);

      // Fetch environments
      try {
        const envs = await api.getProjectEnvironments(projectId);
        setEnvironments(envs.map(mapApiEnvironment));
      } catch {
        setEnvironments([]);
      }

      // Fetch shared users if owner
      try {
        const shares = await api.listProjectShares(projectId);
        setSharedUsers(shares.map(mapApiSharedUser));
      } catch {
        setSharedUsers([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to fetch project data"));
    } finally {
      setIsLoading(false);
    }
  }, [api, projectId]);

  useEffect(() => {
    if (api && !isApiLoading) {
      fetchProjectData();
    }
  }, [api, isApiLoading, fetchProjectData]);

  const loadEnvironmentData = useCallback(
    async (environmentId: string) => {
      if (!api) return;

      setIsLoadingEnvironmentData(true);

      try {
        const envData = await api.getEnvironmentData(environmentId);

        const mappedEnv = mapApiEnvironment(envData.environment);

        setEnvironments((prev) => {
          const exists = prev.some((e) => e.id === mappedEnv.id);
          if (!exists) {
            return [...prev, mappedEnv];
          }
          return prev;
        });

        // Decrypt secrets if project key is available
        const projectKey = await getProjectKeyForProject();
        const decryptedSecrets = await Promise.all(
          envData.secrets.map(async (apiSecret) => {
            const mapped = mapApiSecret(apiSecret);
            if (projectKey && apiSecret.encryptedValue) {
              try {
                const decryptedValue = await decryptSecretValue(
                  projectKey,
                  apiSecret.encryptedValue,
                );
                return { ...mapped, value: decryptedValue };
              } catch (error) {
                logger.error(`Failed to decrypt secret ${mapped.key}:`, error);
                return mapped;
              }
            }
            return mapped;
          }),
        );

        setCurrentEnvironmentData({
          folders: envData.folders.map(mapApiFolder),
          secrets: decryptedSecrets,
        });
      } catch (err) {
        setError(err instanceof Error ? err : new Error("Failed to load environment data"));
      } finally {
        setIsLoadingEnvironmentData(false);
      }
    },
    [api, getProjectKeyForProject],
  );

  // Environment CRUD
  const createEnvironment = useCallback(
    async (name: string, color?: string): Promise<string | undefined> => {
      if (!api) return undefined;

      try {
        const environmentId = await api.createEnvironment({ projectId, name, color });
        await fetchProjectData();
        return environmentId;
      } catch (err) {
        setError(err instanceof Error ? err : new Error("Failed to create environment"));
        throw err;
      }
    },
    [api, projectId, fetchProjectData],
  );

  const updateEnvironment = useCallback(
    async (environmentId: string, name: string, color?: string): Promise<void> => {
      if (!api) return;

      try {
        await api.updateEnvironment({ environmentId, name, color });
        await fetchProjectData();
      } catch (err) {
        setError(err instanceof Error ? err : new Error("Failed to update environment"));
        throw err;
      }
    },
    [api, fetchProjectData],
  );

  const deleteEnvironment = useCallback(
    async (environmentId: string): Promise<void> => {
      if (!api) return;

      try {
        await api.deleteEnvironment(environmentId);
        await fetchProjectData();
      } catch (err) {
        setError(err instanceof Error ? err : new Error("Failed to delete environment"));
        throw err;
      }
    },
    [api, fetchProjectData],
  );

  const createFolder = useCallback(
    async (environmentId: string, name: string): Promise<string | undefined> => {
      if (!api) return undefined;

      try {
        const folderId = await api.createFolder({ environmentId, name });
        await loadEnvironmentData(environmentId);
        return folderId;
      } catch (err) {
        setError(err instanceof Error ? err : new Error("Failed to create folder"));
        throw err;
      }
    },
    [api, loadEnvironmentData],
  );

  const updateFolder = useCallback(
    async (folderId: string, name: string): Promise<void> => {
      if (!api) return;

      try {
        await api.updateFolder({ folderId, name });
        if (currentEnvironmentData) {
          const folder = currentEnvironmentData.folders.find((f) => f.id === folderId);
          if (folder) {
            await loadEnvironmentData(folder.environmentId);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err : new Error("Failed to update folder"));
        throw err;
      }
    },
    [api, currentEnvironmentData, loadEnvironmentData],
  );

  const deleteFolder = useCallback(
    async (folderId: string): Promise<void> => {
      if (!api) return;

      try {
        const folder = currentEnvironmentData?.folders.find((f) => f.id === folderId);
        const environmentId = folder?.environmentId;

        await api.deleteFolder(folderId);

        if (environmentId) {
          await loadEnvironmentData(environmentId);
        }
      } catch (err) {
        setError(err instanceof Error ? err : new Error("Failed to delete folder"));
        throw err;
      }
    },
    [api, currentEnvironmentData, loadEnvironmentData],
  );

  const createSecret = useCallback(
    async (args: {
      environmentId: string;
      folderId?: string;
      key: string;
      encryptedValue: string;
      valueType?: "string" | "number" | "boolean";
      scope?: "client" | "server" | "shared";
      description?: string;
    }): Promise<string | undefined> => {
      if (!api) return undefined;

      try {
        // Encrypt secret before sending
        const projectKey = await getProjectKeyForProject();
        if (!projectKey) {
          throw new Error(
            "Cannot encrypt secret: Project key not available. Please verify your password.",
          );
        }

        const encryptedValue = await encryptSecretValue(projectKey, args.encryptedValue);

        const secretId = await api.createSecret({
          ...args,
          encryptedValue,
        });
        await loadEnvironmentData(args.environmentId);
        return secretId;
      } catch (err) {
        setError(err instanceof Error ? err : new Error("Failed to create secret"));
        throw err;
      }
    },
    [api, loadEnvironmentData, getProjectKeyForProject],
  );

  const updateSecretBulk = useCallback(
    async (args: {
      environmentId: string;
      folderId?: string;
      secrets: Array<{
        secretId?: string;
        key: string;
        encryptedValue: string;
        valueType: "string" | "number" | "boolean";
        scope?: "client" | "server" | "shared";
      }>;
      mode?: "skip" | "overwrite";
    }): Promise<{
      success: boolean;
      updatedCount: number;
      createdCount: number;
      skippedCount: number;
      secretIds: string[];
    }> => {
      if (!api) {
        throw new Error("API not initialized");
      }

      try {
        // Encrypt secrets before sending
        const projectKey = await getProjectKeyForProject();
        if (!projectKey) {
          throw new Error("Cannot encrypt secrets: Project key not available");
        }

        const encryptedSecrets = await Promise.all(
          args.secrets.map(async (secret) => ({
            ...secret,
            encryptedValue: await encryptSecretValue(projectKey, secret.encryptedValue),
          })),
        );

        const result = await api.updateSecretBulk({
          ...args,
          secrets: encryptedSecrets,
        });
        await loadEnvironmentData(args.environmentId);
        return result;
      } catch (err) {
        if (err instanceof ProjectKeyError) {
          setError(err);
          throw err;
        }
        setError(err instanceof Error ? err : new Error("Failed to update secrets in bulk"));
        throw err;
      }
    },
    [api, loadEnvironmentData, getProjectKeyForProject],
  );

  const updateSecret = useCallback(
    async (args: {
      secretId: string;
      key?: string;
      encryptedValue?: string;
      valueType?: "string" | "number" | "boolean";
      scope?: "client" | "server" | "shared";
      description?: string;
    }): Promise<void> => {
      if (!api) return;

      try {
        // Encrypt secret value if provided
        let encryptedValue = args.encryptedValue;
        if (encryptedValue) {
          const projectKey = await getProjectKeyForProject();
          if (!projectKey) {
            throw new Error(
              "Cannot encrypt secret: Project key not available. Please verify your password.",
            );
          }
          encryptedValue = await encryptSecretValue(projectKey, encryptedValue);
        }

        await api.updateSecret({
          ...args,
          encryptedValue,
        });
        const secret = currentEnvironmentData?.secrets.find((s) => s.id === args.secretId);
        if (secret) {
          await loadEnvironmentData(secret.environmentId);
        }
      } catch (err) {
        if (err instanceof ProjectKeyError) {
          setError(err);
          throw err;
        }
        setError(err instanceof Error ? err : new Error("Failed to update secret"));
        throw err;
      }
    },
    [api, currentEnvironmentData, loadEnvironmentData, getProjectKeyForProject],
  );

  const deleteSecret = useCallback(
    async (secretId: string): Promise<void> => {
      if (!api) return;

      try {
        const secret = currentEnvironmentData?.secrets.find((s) => s.id === secretId);
        const environmentId = secret?.environmentId;

        await api.deleteSecret(secretId);

        if (environmentId) {
          await loadEnvironmentData(environmentId);
        }
      } catch (err) {
        setError(err instanceof Error ? err : new Error("Failed to delete secret"));
        throw err;
      }
    },
    [api, currentEnvironmentData, loadEnvironmentData],
  );

  const shareProject = useCallback(
    async (email: string, encryptedProjectKey: string): Promise<void> => {
      if (!api) return;

      try {
        await api.shareProject({ projectId, email, encryptedProjectKey });
        await fetchProjectData();
      } catch (err) {
        setError(err instanceof Error ? err : new Error("Failed to share project"));
        throw err;
      }
    },
    [api, projectId, fetchProjectData],
  );

  const revokeShare = useCallback(
    async (shareId: string): Promise<void> => {
      if (!api) return;

      try {
        await api.revokeShare(shareId);
        await fetchProjectData();
      } catch (err) {
        setError(err instanceof Error ? err : new Error("Failed to revoke share"));
        throw err;
      }
    },
    [api, fetchProjectData],
  );

  return {
    project,
    environments,
    currentEnvironmentData,
    sharedUsers,
    isLoading: isLoading || isApiLoading,
    isLoadingEnvironmentData,
    error: error || apiError,
    refetch: fetchProjectData,
    loadEnvironmentData,
    createEnvironment,
    updateEnvironment,
    deleteEnvironment,
    createFolder,
    updateFolder,
    deleteFolder,
    createSecret,
    updateSecret,
    updateSecretBulk,
    deleteSecret,
    shareProject,
    revokeShare,
  };
}
