import { api, type Id } from "@repo/backend";
import { useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getProtectedApi } from "../api";
import type { Project as ApiProject, SharedUser, ShareLimits } from "../types/api";
import { logger } from "../utils/debugLog";

export function useProject(projectId: string) {
  const projectData = useQuery(api.project.getProject, {
    projectId: projectId as Id<"project">,
  });
  const sharesData = useQuery(api.projectShare.listActiveProjectSharesByProject, {
    projectId: projectId as Id<"project">,
  });

  const [shareLimits, setShareLimits] = useState<ShareLimits | null>(null);
  const [limitsLoading, setLimitsLoading] = useState(true);

  const fetchShareLimits = useCallback(async () => {
    setLimitsLoading(true);
    try {
      const apiClient = getProtectedApi();
      await apiClient.ensureAuth();
      const limits = await apiClient.getShareLimits(projectId);
      setShareLimits(limits);
    } catch (err) {
      logger.error("Failed to fetch share limits:", err);
      setShareLimits(null);
    } finally {
      setLimitsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchShareLimits();
  }, [fetchShareLimits]);

  const project = useMemo<ApiProject | null>(() => {
    if (!projectData) return null;
    return {
      id: projectData.id as string,
      name: projectData.name,
      slug: projectData.slug,
      description: projectData.description,
      ownerId: projectData.ownerId,
      isArchived: projectData.isArchived,
      keyVersion: projectData.keyVersion,
      encryptedProjectKey: projectData.encryptedProjectKey,
      createdAt: projectData.createdAt,
      updatedAt: projectData.updatedAt,
      shareUsageCount: 0,
    };
  }, [projectData]);

  const sharedUsers = useMemo<SharedUser[]>(() => {
    if (!sharesData?.shares) return [];
    return sharesData.shares.map((share) => ({
      id: share.id as string,
      email: share.userEmail,
      name: share.userName,
      publicKey: share.userPublicKey,
      sharedAt: share.sharedAt,
    }));
  }, [sharesData]);

  const isLoading = projectData === undefined || sharesData === undefined || limitsLoading;

  return {
    project,
    sharedUsers,
    shareLimits,
    isLoading,
    error: null,
    refetch: fetchShareLimits,
  };
}
