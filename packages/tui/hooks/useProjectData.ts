import { useCallback, useEffect, useState } from "react";
import type { Project as ApiProject, EnvironmentData } from "../convex/api/types";
import { useApi } from "../convex/hooks/useApi";
import type { Environment, Folder, Secret, SharedUser } from "../types/models";
import { mapApiEnvironment, mapApiFolder, mapApiSecret, mapApiSharedUser } from "../utils/mappers";

interface UseProjectDataReturn {
  // Project info
  project: ApiProject | null;

  // Environments
  environments: Environment[];

  // Current environment data
  currentEnvironmentData: {
    folders: Folder[];
    secrets: Secret[];
  } | null;

  // Shared users
  sharedUsers: SharedUser[];

  // Loading states
  isLoading: boolean;
  isLoadingEnvironmentData: boolean;

  // Error states
  error: Error | null;

  // Actions
  refetch: () => Promise<void>;
  loadEnvironmentData: (environmentId: string) => Promise<void>;

  // Environment CRUD
  createEnvironment: (name: string, color?: string) => Promise<string | undefined>;
  updateEnvironment: (environmentId: string, name: string, color?: string) => Promise<void>;
  deleteEnvironment: (environmentId: string) => Promise<void>;

  // Folder CRUD
  createFolder: (environmentId: string, name: string) => Promise<string | undefined>;
  updateFolder: (folderId: string, name: string) => Promise<void>;
  deleteFolder: (folderId: string) => Promise<void>;

  // Secret CRUD (encrypted values handled by caller)
  createSecret: (args: {
    environmentId: string;
    folderId?: string;
    key: string;
    encryptedValue: string;
    valueType?: "string" | "number" | "boolean";
    scope?: "client" | "server" | "shared";
    description?: string;
  }) => Promise<string | undefined>;
  updateSecret: (args: {
    secretId: string;
    key?: string;
    encryptedValue?: string;
    valueType?: "string" | "number" | "boolean";
    scope?: "client" | "server" | "shared";
    description?: string;
  }) => Promise<void>;
  deleteSecret: (secretId: string) => Promise<void>;

  // Sharing
  shareProject: (email: string, encryptedProjectKey: string) => Promise<void>;
  revokeShare: (shareId: string) => Promise<void>;
}

export function useProjectData(projectId: string): UseProjectDataReturn {
  const { api, isLoading: isApiLoading, error: apiError } = useApi();

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

  // Fetch project and its environments
  const fetchProjectData = useCallback(async () => {
    if (!api) return;

    setIsLoading(true);
    setError(null);

    try {
      // Fetch project details
      const projectData = await api.getProject(projectId);
      setProject(projectData);

      // Fetch shared users if owner
      try {
        const shares = await api.listProjectShares(projectId);
        setSharedUsers(shares.map(mapApiSharedUser));
      } catch {
        // User may not have permission to list shares
        setSharedUsers([]);
      }

      // Note: We need to fetch environments from the project data
      // Since the API returns project with environments, we extract them
      // For now, we'll fetch environment data when user selects one
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

  // Load environment data (folders + secrets)
  const loadEnvironmentData = useCallback(
    async (environmentId: string) => {
      if (!api) return;

      setIsLoadingEnvironmentData(true);

      try {
        const envData = await api.getEnvironmentData(environmentId);

        // Map the environment to our local format
        const mappedEnv = mapApiEnvironment(envData.environment);

        // Update environments list if not already there
        setEnvironments((prev) => {
          const exists = prev.some((e) => e.id === mappedEnv.id);
          if (!exists) {
            return [...prev, mappedEnv];
          }
          return prev;
        });

        setCurrentEnvironmentData({
          folders: envData.folders.map(mapApiFolder),
          secrets: envData.secrets.map(mapApiSecret),
        });
      } catch (err) {
        setError(err instanceof Error ? err : new Error("Failed to load environment data"));
      } finally {
        setIsLoadingEnvironmentData(false);
      }
    },
    [api],
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

  // Folder CRUD
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
        // Refresh current environment data if we have one
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
        // Get environment ID before deleting
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

  // Secret CRUD
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
        const secretId = await api.createSecret(args);
        await loadEnvironmentData(args.environmentId);
        return secretId;
      } catch (err) {
        setError(err instanceof Error ? err : new Error("Failed to create secret"));
        throw err;
      }
    },
    [api, loadEnvironmentData],
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
        await api.updateSecret(args);
        // Find the secret's environment to refresh
        const secret = currentEnvironmentData?.secrets.find((s) => s.id === args.secretId);
        if (secret) {
          await loadEnvironmentData(secret.environmentId);
        }
      } catch (err) {
        setError(err instanceof Error ? err : new Error("Failed to update secret"));
        throw err;
      }
    },
    [api, currentEnvironmentData, loadEnvironmentData],
  );

  const deleteSecret = useCallback(
    async (secretId: string): Promise<void> => {
      if (!api) return;

      try {
        // Get environment ID before deleting
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

  // Sharing
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
    deleteSecret,
    shareProject,
    revokeShare,
  };
}
