import { useCallback, useEffect, useState } from "react";
import { useApi } from "../convex/hooks/useApi";
import type { Project } from "../types/models";
import { mapApiProjects } from "../utils/mappers";

interface UseProjectsReturn {
  projects: Project[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  createProject: (name: string, encryptedProjectKey: string) => Promise<string | undefined>;
  renameProject: (projectId: string, name: string) => Promise<void>;
  archiveProject: (projectId: string) => Promise<void>;
}

export function useProjects(): UseProjectsReturn {
  const { api, isLoading: isApiLoading, error: apiError } = useApi();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchProjects = useCallback(async () => {
    if (!api) return;

    setIsLoading(true);
    setError(null);

    try {
      const apiProjects = await api.listProjects();
      setProjects(mapApiProjects(apiProjects));
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to fetch projects"));
    } finally {
      setIsLoading(false);
    }
  }, [api]);

  useEffect(() => {
    if (api && !isApiLoading) {
      fetchProjects();
    }
  }, [api, isApiLoading, fetchProjects]);

  const createProject = useCallback(
    async (name: string, encryptedProjectKey: string): Promise<string | undefined> => {
      if (!api) {
        setError(new Error("API not initialized"));
        return undefined;
      }

      try {
        const projectId = await api.createProject({ name, encryptedProjectKey });
        await fetchProjects(); // Refetch to get updated list
        return projectId;
      } catch (err) {
        setError(err instanceof Error ? err : new Error("Failed to create project"));
        throw err;
      }
    },
    [api, fetchProjects],
  );

  const renameProject = useCallback(
    async (projectId: string, name: string): Promise<void> => {
      if (!api) {
        setError(new Error("API not initialized"));
        return;
      }

      try {
        await api.updateProject({ projectId, name });
        await fetchProjects(); // Refetch to get updated list
      } catch (err) {
        setError(err instanceof Error ? err : new Error("Failed to rename project"));
        throw err;
      }
    },
    [api, fetchProjects],
  );

  const archiveProject = useCallback(
    async (projectId: string): Promise<void> => {
      if (!api) {
        setError(new Error("API not initialized"));
        return;
      }

      try {
        await api.archiveProject(projectId);
        await fetchProjects(); // Refetch to get updated list
      } catch (err) {
        setError(err instanceof Error ? err : new Error("Failed to archive project"));
        throw err;
      }
    },
    [api, fetchProjects],
  );

  return {
    projects,
    isLoading: isLoading || isApiLoading,
    error: error || apiError,
    refetch: fetchProjects,
    createProject,
    renameProject,
    archiveProject,
  };
}
