import { useCallback, useEffect, useState } from "react";
import type { CreateProjectResult } from "../convex/api/types";
import { useApi } from "../convex/hooks/useApi";
import type { Project } from "../types/models";
import { logger } from "../utils/debugLog";
import { mapApiProjects } from "../utils/mappers";

interface UseProjectsReturn {
  projects: Project[];
  isLoading: boolean;
  error: Error | null;
  limits: { usage: number; included_usage: number } | null;
  isLoadingLimits: boolean;
  refetch: () => Promise<void>;
  refetchLimits: () => Promise<void>;
  createProject: (
    name: string,
    encryptedProjectKey: string,
    confirmPayment?: boolean,
  ) => Promise<CreateProjectResult>;
  renameProject: (projectId: string, name: string) => Promise<void>;
  archiveProject: (projectId: string) => Promise<void>;
}

export function useProjects(): UseProjectsReturn {
  const { api, isLoading: isApiLoading, error: apiError } = useApi();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [limits, setLimits] = useState<{ usage: number; included_usage: number } | null>(null);
  const [isLoadingLimits, setIsLoadingLimits] = useState(true);

  const fetchProjects = useCallback(async () => {
    if (!api) return;

    setIsLoading(true);
    setError(null);

    try {
      const [ownedProjects, sharedProjects] = await Promise.all([
        api.listProjects(),
        api.listSharedProjects().catch((err) => {
          logger.error("Failed to fetch shared projects:", err);
          return [];
        }),
      ]);

      const projectMap = new Map<string, (typeof ownedProjects)[0]>();

      ownedProjects.forEach((project) => {
        const projectId = (project as any).id || (project as any)._id;
        if (projectId) {
          projectMap.set(projectId, project);
        }
      });

      sharedProjects.forEach((project) => {
        const projectId = (project as any).id || (project as any)._id;
        if (projectId && !projectMap.has(projectId)) {
          projectMap.set(projectId, project);
        }
      });

      const allProjects = Array.from(projectMap.values());
      const mappedProjects = mapApiProjects(allProjects);

      const sortedProjects = mappedProjects.sort((a, b) => {
        const getSortOrder = (status: string) => {
          if (status === "archived") return 3;
          if (status === "restricted") return 2;
          return 1;
        };

        const orderA = getSortOrder(a.status);
        const orderB = getSortOrder(b.status);

        if (orderA !== orderB) {
          return orderA - orderB;
        }

        return a.name.localeCompare(b.name);
      });

      setProjects(sortedProjects);
    } catch (err) {
      logger.error("Failed to fetch projects:", err);
      setError(err instanceof Error ? err : new Error("Failed to fetch projects"));
    } finally {
      setIsLoading(false);
    }
  }, [api]);

  const fetchLimits = useCallback(async () => {
    if (!api) {
      setIsLoadingLimits(false);
      return;
    }

    setIsLoadingLimits(true);
    setLimits(null);

    try {
      const limitsData = await api.getLimits();
      if (
        limitsData &&
        typeof limitsData === "object" &&
        "usage" in limitsData &&
        "included_usage" in limitsData
      ) {
        setLimits(limitsData);
      } else {
        setLimits(null);
      }
    } catch (err) {
      logger.error("Failed to fetch limits:", err);
      setLimits(null);
    } finally {
      setIsLoadingLimits(false);
    }
  }, [api]);

  useEffect(() => {
    if (api && !isApiLoading) {
      fetchProjects();
      fetchLimits();
    }
  }, [api, isApiLoading, fetchProjects, fetchLimits]);

  const createProject = useCallback(
    async (
      name: string,
      encryptedProjectKey: string,
      confirmPayment?: boolean,
    ): Promise<CreateProjectResult> => {
      if (!api) {
        setError(new Error("API not initialized"));
        return { success: false, message: "API not initialized" };
      }

      try {
        const result = await api.createProject({ name, encryptedProjectKey, confirmPayment });
        if (result.success) {
          await Promise.all([fetchProjects(), fetchLimits()]);
        }
        return result;
      } catch (err) {
        setError(err instanceof Error ? err : new Error("Failed to create project"));
        throw err;
      }
    },
    [api, fetchProjects, fetchLimits],
  );

  const renameProject = useCallback(
    async (projectId: string, name: string): Promise<void> => {
      if (!api) {
        setError(new Error("API not initialized"));
        return;
      }

      try {
        await api.updateProject({ projectId, name });
        await fetchProjects();
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
        await Promise.all([fetchProjects(), fetchLimits()]);
      } catch (err) {
        setError(err instanceof Error ? err : new Error("Failed to archive project"));
        throw err;
      }
    },
    [api, fetchProjects, fetchLimits],
  );

  return {
    projects,
    isLoading: isLoading || isApiLoading,
    error: error || apiError,
    limits,
    isLoadingLimits,
    refetch: fetchProjects,
    refetchLimits: fetchLimits,
    createProject,
    renameProject,
    archiveProject,
  };
}
