import { useCallback, useEffect, useState } from "react";
import { getProtectedApi } from "../api";
import type { Project as ApiProject, SharedUser, ShareLimits } from "../types/api";
import { logger } from "../utils/debugLog";

export function useProject(projectId: string) {
  const [project, setProject] = useState<ApiProject | null>(null);
  const [sharedUsers, setSharedUsers] = useState<SharedUser[]>([]);
  const [shareLimits, setShareLimits] = useState<ShareLimits | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const api = getProtectedApi();
      await api.ensureAuth();

      const [projectData, shares, limits] = await Promise.all([
        api.getProject(projectId),
        api.listProjectShares(projectId).catch(() => ({ shares: [] })),
        api.getShareLimits(projectId).catch(() => null),
      ]);

      setProject(projectData);
      setSharedUsers(shares.shares);
      setShareLimits(limits);
    } catch (err) {
      logger.error("Failed to fetch project:", err);
      setError(err instanceof Error ? err : new Error("Failed to fetch project"));
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { project, sharedUsers, shareLimits, isLoading, error, refetch: fetch };
}
