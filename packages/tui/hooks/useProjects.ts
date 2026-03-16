import { api } from "@repo/backend";
import { createLogger, trackError } from "@repo/logger";
import { useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getProtectedApi } from "../api";
import type { CreateProjectResult } from "../types/api";
import type { Project } from "../types/models";

const logger = createLogger("tui");

export function useProjects() {
  const ownedProjectsData = useQuery(api.project.listUserProjects);
  const sharedProjectsData = useQuery(api.projectShare.listActiveSharedProjectsForCurrentUser);

  const [limits, setLimits] = useState<{ usage: number; includedUsage: number } | null>(null);
  const [limitsLoading, setLimitsLoading] = useState(true);
  const [limitsError, setLimitsError] = useState<Error | null>(null);

  const fetchLimits = useCallback(async () => {
    setLimitsLoading(true);
    setLimitsError(null);
    try {
      const apiClient = getProtectedApi();
      await apiClient.ensureAuth();
      const limitsData = await apiClient.getLimits();
      setLimits(limitsData);
    } catch (err) {
      logger.error("Failed to fetch limits:", err);
      trackError("tui", err, { action: "fetch_limits" });
      setLimits(null);
      setLimitsError(err instanceof Error ? err : new Error("Failed to fetch limits"));
    } finally {
      setLimitsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLimits();
  }, [fetchLimits]);

  const { archivedCount, projects } = useMemo(() => {
    const projectMap = new Map<string, Project>();

    if (ownedProjectsData?.projects) {
      for (const p of ownedProjectsData.projects) {
        projectMap.set(p.id, {
          id: p.id,
          name: p.name,
          status: p.status as Project["status"],
        });
      }
    }

    if (sharedProjectsData?.shares) {
      for (const s of sharedProjectsData.shares) {
        if (!projectMap.has(s.projectId)) {
          projectMap.set(s.projectId, {
            id: s.projectId,
            name: s.projectName,
            status: s.status as Project["status"],
          });
        }
      }
    }

    const allProjects = Array.from(projectMap.values());
    const archivedCount = allProjects.filter((p) => p.status === "archived").length;

    const sorted = allProjects
      .filter((p) => p.status !== "archived")
      .sort((a, b) => {
        const order = { owned: 1, shared: 1, restricted: 2 };
        const diff =
          (order[a.status as keyof typeof order] || 1) -
          (order[b.status as keyof typeof order] || 1);
        return diff !== 0 ? diff : a.name.localeCompare(b.name);
      });

    return { archivedCount, projects: sorted };
  }, [ownedProjectsData, sharedProjectsData]);

  const isLoading =
    ownedProjectsData === undefined || sharedProjectsData === undefined || limitsLoading;

  const createProject = useCallback(
    async (
      name: string,
      encryptedProjectKey: string,
      confirmPayment?: boolean,
    ): Promise<CreateProjectResult> => {
      try {
        const apiClient = getProtectedApi();
        await apiClient.ensureAuth();
        const result = await apiClient.createProject({ name, encryptedProjectKey, confirmPayment });
        if (result.status === "success") {
          fetchLimits();
        }
        return result;
      } catch (err) {
        throw err instanceof Error ? err : new Error("Failed to create project");
      }
    },
    [fetchLimits],
  );

  const renameProject = useCallback(async (projectId: string, name: string) => {
    const apiClient = getProtectedApi();
    await apiClient.ensureAuth();
    await apiClient.updateProject({ projectId, name });
  }, []);

  const archiveProject = useCallback(
    async (projectId: string) => {
      const apiClient = getProtectedApi();
      await apiClient.ensureAuth();
      await apiClient.archiveProject(projectId);
      fetchLimits();
    },
    [fetchLimits],
  );

  return {
    archivedCount,
    projects,
    limits,
    isLoading,
    error: limitsError,
    refetch: fetchLimits,
    createProject,
    renameProject,
    archiveProject,
  };
}
