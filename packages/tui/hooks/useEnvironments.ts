import { useCallback, useEffect, useState } from "react";
import { getProtectedApi } from "../api";
import type { Environment } from "../types/models";
import { logger } from "../utils/debugLog";
import { mapApiEnvironment } from "../utils/mappers";

export function useEnvironments(projectId: string) {
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const api = getProtectedApi();
      await api.ensureAuth();
      const envs = await api.getProjectEnvironments(projectId);
      setEnvironments(envs.map(mapApiEnvironment));
    } catch (err) {
      logger.error("Failed to fetch environments:", err);
      setError(err instanceof Error ? err : new Error("Failed to fetch environments"));
      setEnvironments([]);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const create = useCallback(
    async (name: string, color?: string) => {
      const api = getProtectedApi();
      await api.ensureAuth();
      const id = await api.createEnvironment({ projectId, name, color });
      await fetch();
      return id;
    },
    [projectId, fetch],
  );

  const update = useCallback(
    async (environmentId: string, name: string, color?: string) => {
      const api = getProtectedApi();
      await api.ensureAuth();
      await api.updateEnvironment({ environmentId, name, color });
      await fetch();
    },
    [fetch],
  );

  const remove = useCallback(
    async (environmentId: string) => {
      const api = getProtectedApi();
      await api.ensureAuth();
      await api.deleteEnvironment(environmentId);
      await fetch();
    },
    [fetch],
  );

  return { environments, isLoading, error, refetch: fetch, create, update, remove };
}
