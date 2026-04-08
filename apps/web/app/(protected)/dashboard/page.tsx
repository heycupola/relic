"use client";

import { api } from "@repo/backend";
import { useAction, useQuery } from "convex/react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { ActivityLogsCard } from "@/components/dashboard/activity-logs-card";
import { ApiKeysCard } from "@/components/dashboard/api-keys-card";
import { ProjectsOverviewCard } from "@/components/dashboard/projects-overview-card";
import { QuickActionsCard } from "@/components/dashboard/quick-actions-card";
import { ServiceAccountsCard } from "@/components/dashboard/service-accounts-card";
import { UserInfoCard } from "@/components/dashboard/user-info-card";
import { StatusBox } from "@/components/status-box";
import { usePaginatedActionLogs } from "@/hooks/usePaginatedActionLogs";
import { authClient } from "@/lib/auth";
import { trackWebEvent } from "@/lib/posthog";

function UpgradeHandler({
  userData,
  onError,
}: {
  userData: { hasPro?: boolean } | undefined;
  onError: (error: string) => void;
}) {
  const searchParams = useSearchParams();
  const getProPlanAction = useAction(api.user.getProPlan);

  useEffect(() => {
    const action = searchParams.get("action");

    if (action === "upgrade" && userData && !userData.hasPro) {
      const handleUpgrade = async () => {
        trackWebEvent("web_upgrade_started");
        try {
          const result = await getProPlanAction({});
          if (result.checkoutLink) {
            // Clean the URL before redirecting
            const url = new URL(window.location.href);
            url.searchParams.delete("action");
            window.history.replaceState({}, "", url.toString());

            // Redirect to checkout
            window.location.href = result.checkoutLink;
          }
        } catch (error) {
          console.error("Failed to get checkout link:", error);
          onError("Failed to start checkout. Please try again.");
          // Clean the URL even on error
          const url = new URL(window.location.href);
          url.searchParams.delete("action");
          window.history.replaceState({}, "", url.toString());
        }
      };

      handleUpgrade();
    }
  }, [searchParams, userData, getProPlanAction, onError]);

  return null;
}

export default function DashboardPage() {
  useEffect(() => {
    trackWebEvent("web_page_viewed", { page: "dashboard" });
  }, []);
  const { data: session } = authClient.useSession();

  // Fetch user data
  const userData = useQuery(api.user.getCurrentUser, session?.user ? {} : "skip");
  const projectsData = useQuery(api.project.listUserProjects, session?.user ? {} : "skip");
  const sharedProjectsData = useQuery(
    api.projectShare.listActiveSharedProjectsForCurrentUser,
    session?.user ? {} : "skip",
  );
  const apiKeysData = useQuery(api.apiKey.listApiKeys, session?.user ? {} : "skip");

  // Paginated action logs
  const {
    logs: actionLogs,
    isLoading: logsLoading,
    canLoadMore,
    isLoadingMore,
    loadMore,
  } = usePaginatedActionLogs(!!session?.user);

  const getLimitsAction = useAction(api.project.getLimits);
  const getProjectLimitsAction = useAction(api.project.getProjectLimits);
  const [limitsData, setLimitsData] = useState<{ usage: number; includedUsage: number } | null>(
    null,
  );
  const [projectLimitsData, setProjectLimitsData] = useState<{
    totalProjectsCount: number;
    includedUsage: number;
    hasPro: boolean;
    freeLimit: number;
  } | null>(null);
  const [limitsLoading, setLimitsLoading] = useState(true);

  useEffect(() => {
    if (!session?.user) return;

    Promise.all([getLimitsAction({}), getProjectLimitsAction({}).catch(() => null)])
      .then(([limits, projectLimits]) => {
        setLimitsData(limits);
        if (projectLimits) {
          setProjectLimitsData(projectLimits);
        }
        setLimitsLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch limits:", err);
        setLimitsLoading(false);
      });
  }, [session?.user, getLimitsAction, getProjectLimitsAction]);

  const [upgradeError, setUpgradeError] = useState<string>("");

  const isLoading =
    userData === undefined ||
    projectsData === undefined ||
    sharedProjectsData === undefined ||
    logsLoading ||
    limitsLoading;

  const allProjects = useMemo(() => {
    const projectMap = new Map<
      string,
      {
        id: string;
        name: string;
        status: "owned" | "shared" | "restricted" | "archived";
        shareCount: number;
      }
    >();

    for (const project of projectsData?.projects || []) {
      projectMap.set(project.id, {
        id: project.id,
        name: project.name,
        status: project.status as "owned" | "shared" | "restricted" | "archived",
        shareCount: project.shareUsageCount || 0,
      });
    }

    for (const share of sharedProjectsData?.shares || []) {
      if (!projectMap.has(share.projectId)) {
        projectMap.set(share.projectId, {
          id: share.projectId,
          name: share.projectName,
          status: share.status as "shared" | "restricted" | "archived",
          shareCount: 0,
        });
      }
    }

    const order = { owned: 1, shared: 1, restricted: 2, archived: 3 } as const;

    return Array.from(projectMap.values()).sort((a, b) => {
      const statusDiff = order[a.status] - order[b.status];
      return statusDiff !== 0 ? statusDiff : a.name.localeCompare(b.name);
    });
  }, [projectsData?.projects, sharedProjectsData?.shares]);

  const isOverProjectLimit =
    projectLimitsData &&
    !projectLimitsData.hasPro &&
    projectLimitsData.totalProjectsCount > projectLimitsData.freeLimit;
  const excessProjects = isOverProjectLimit
    ? projectLimitsData.totalProjectsCount - projectLimitsData.freeLimit
    : 0;

  return (
    <>
      <Suspense fallback={null}>
        <UpgradeHandler userData={userData} onError={setUpgradeError} />
      </Suspense>
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8 lg:px-12">
        <div className="sr-only" role="alert" aria-live="assertive" aria-atomic="true">
          {upgradeError}
        </div>
        <div className="space-y-4 sm:space-y-5">
          {isOverProjectLimit && (
            <StatusBox variant="warning">
              <h3 className="font-medium text-foreground text-sm">Usage limit exceeded</h3>
              <p className="text-sm text-foreground/70 mt-1 text-pretty">
                You're using {projectLimitsData.totalProjectsCount} projects but your plan only
                includes {projectLimitsData.freeLimit}. Please archive {excessProjects} project(s)
                or upgrade your plan.
              </p>
            </StatusBox>
          )}

          {/* Top row - User Info and Projects */}
          <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-2">
            <UserInfoCard
              name={userData?.name || "User"}
              email={userData?.email || ""}
              hasPro={userData?.hasPro || false}
              isLoading={isLoading}
            />
            <ProjectsOverviewCard
              projects={allProjects}
              projectsUsed={limitsData?.usage || 0}
              projectsLimit={limitsData?.includedUsage || 0}
              isLoading={isLoading}
            />
          </div>

          {/* Bottom row - Quick Actions and Activity Logs */}
          <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-2">
            <QuickActionsCard />
            <ActivityLogsCard
              logs={actionLogs}
              isLoading={isLoading}
              canLoadMore={canLoadMore}
              isLoadingMore={isLoadingMore}
              onLoadMore={loadMore}
            />
          </div>

          <ApiKeysCard
            apiKeys={apiKeysData ?? []}
            projectNames={Object.fromEntries(
              (projectsData?.projects ?? []).map((p) => [String(p.id), p.name]),
            )}
            isLoading={apiKeysData === undefined}
            hasPro={userData?.hasPro || false}
          />

          {(projectsData?.projects ?? [])
            .filter((p) => p.status === "owned" && !p.isArchived)
            .map((project) => (
              <ServiceAccountsCard
                key={`sa-${project.id}`}
                projectId={String(project.id)}
                isOwner={true}
                hasPro={userData?.hasPro || false}
              />
            ))}
        </div>
      </div>
    </>
  );
}
