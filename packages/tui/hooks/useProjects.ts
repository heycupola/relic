import { useCallback, useEffect, useState } from "react";
import { getProtectedApi } from "../api";
import type { CreateProjectResult, ProjectListItem } from "../types/api";
import type { Project } from "../types/models";
import { logger } from "../utils/debugLog";
import { mapApiProjects } from "../utils/mappers";

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [limits, setLimits] = useState<{ usage: number; included_usage: number } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const api = getProtectedApi();
      await api.ensureAuth();

      const [owned, shared, limitsData] = await Promise.all([
        api.listProjects(),
        api.listSharedProjects().catch(() => []),
        api.getLimits().catch(() => null),
      ]);

      const projectMap = new Map<string, ProjectListItem>();
      [...owned, ...shared].forEach((p) => {
        const id = p.id || p._id;
        if (id && !projectMap.has(id)) projectMap.set(id, p);
      });

      const sorted = mapApiProjects(Array.from(projectMap.values())).sort((a, b) => {
        const order = { active: 1, restricted: 2, archived: 3 };
        const diff =
          (order[a.status as keyof typeof order] || 1) -
          (order[b.status as keyof typeof order] || 1);
        return diff !== 0 ? diff : a.name.localeCompare(b.name);
      });

      setProjects(sorted);
      setLimits(limitsData);
    } catch (err) {
      logger.error("Failed to fetch projects:", err);
      setError(err instanceof Error ? err : new Error("Failed to fetch projects"));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const createProject = useCallback(
    async (
      name: string,
      encryptedProjectKey: string,
      confirmPayment?: boolean,
    ): Promise<CreateProjectResult> => {
      try {
        const api = getProtectedApi();
        await api.ensureAuth();
        const result = await api.createProject({ name, encryptedProjectKey, confirmPayment });
        if (result.success) await fetch();
        return result;
      } catch (err) {
        throw err instanceof Error ? err : new Error("Failed to create project");
      }
    },
    [fetch],
  );

  const renameProject = useCallback(
    async (projectId: string, name: string) => {
      const api = getProtectedApi();
      await api.ensureAuth();
      await api.updateProject({ projectId, name });
      await fetch();
    },
    [fetch],
  );

  const archiveProject = useCallback(
    async (projectId: string) => {
      const api = getProtectedApi();
      await api.ensureAuth();
      await api.archiveProject(projectId);
      await fetch();
    },
    [fetch],
  );

  return {
    projects,
    limits,
    isLoading,
    error,
    refetch: fetch,
    createProject,
    renameProject,
    archiveProject,
  };
}
