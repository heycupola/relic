import { api, type Id } from "@repo/backend";
import { createLogger, trackError } from "@repo/logger";
import { useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getProtectedApi } from "../api";
import { useUser } from "../context";
import type { Project as ApiProject, SharedUser, ShareLimits } from "../types/api";

const logger = createLogger("tui");

export function useProject(projectId: string) {
  const { user } = useUser();

  const projectData = useQuery(api.project.getProject, {
    projectId: projectId as Id<"project">,
  });

  // NOTE: Only fetch shares list if the current user is the project owner.
  // Non-owners (shared users) don't need this data and don't have permission to fetch it.
  const isOwner = projectData && user ? projectData.ownerId === user.id : false;
  const sharesData = useQuery(
    api.projectShare.listActiveProjectSharesByProject,
    isOwner ? { projectId: projectId as Id<"project"> } : "skip",
  );

  const [shareLimits, setShareLimits] = useState<ShareLimits | null>(null);
  const [limitsLoading, setLimitsLoading] = useState(false);

  const fetchShareLimits = useCallback(async () => {
    setLimitsLoading(true);
    try {
      const apiClient = getProtectedApi();
      await apiClient.ensureAuth();
      const limits = await apiClient.getShareLimits(projectId);
      setShareLimits(limits);
    } catch (err) {
      logger.error("Failed to fetch share limits:", err);
      trackError("tui", err, { action: "fetch_share_limits" });
      setShareLimits(null);
    } finally {
      setLimitsLoading(false);
    }
  }, [projectId]);

  // NOTE: Only fetch share limits for owners (non-owners don't need this data).
  useEffect(() => {
    if (isOwner) {
      fetchShareLimits();
    } else {
      setShareLimits(null);
      setLimitsLoading(false);
    }
  }, [isOwner, fetchShareLimits]);

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

  // NOTE: For owners: wait for project, shares, and limits.
  // For non-owners: only wait for project data (shares query is skipped).
  const isLoading =
    projectData === undefined || (isOwner && (sharesData === undefined || limitsLoading));

  return {
    project,
    sharedUsers,
    shareLimits,
    isLoading,
    error: null,
    refetch: fetchShareLimits,
  };
}
