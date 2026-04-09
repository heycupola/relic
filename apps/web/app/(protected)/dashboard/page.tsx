"use client";

import { api } from "@repo/backend";
import { useAction, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityLogsCard } from "@/components/dashboard/activity-logs-card";
import { ApiKeysCard } from "@/components/dashboard/api-keys-card";
import { ProjectsOverviewCard } from "@/components/dashboard/projects-overview-card";
import { QuickActionsCard } from "@/components/dashboard/quick-actions-card";
import { ServiceAccountsCard } from "@/components/dashboard/service-accounts-card";
import { UserInfoCard } from "@/components/dashboard/user-info-card";
import { Dialog } from "@/components/dialog";
import { StatusBox } from "@/components/status-box";
import { usePaginatedActionLogs } from "@/hooks/usePaginatedActionLogs";
import { authClient } from "@/lib/auth";
import { trackWebEvent } from "@/lib/posthog";

function useUpgradeAction(
  userData: { hasPro?: boolean } | undefined,
  onState: (state: "idle" | "already_pro" | "redirecting" | "error") => void,
) {
  const getProPlanAction = useAction(api.user.getProPlan);
  const [handled, setHandled] = useState(false);

  useEffect(() => {
    if (handled || !userData) return;

    const params = new URLSearchParams(window.location.search);
    if (params.get("action") !== "upgrade") return;

    setHandled(true);

    const cleanUrl = () => {
      const url = new URL(window.location.href);
      url.searchParams.delete("action");
      window.history.replaceState({}, "", url.toString());
    };

    if (userData.hasPro) {
      onState("already_pro");
      cleanUrl();
      return;
    }

    onState("redirecting");
    trackWebEvent("web_upgrade_started");

    getProPlanAction({})
      .then((result) => {
        if (result.checkoutLink) {
          cleanUrl();
          window.location.href = result.checkoutLink;
        } else {
          onState("error");
          cleanUrl();
        }
      })
      .catch((error) => {
        console.error("Failed to get checkout link:", error);
        onState("error");
        cleanUrl();
      });
  }, [userData, handled, getProPlanAction, onState]);
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

  const [upgradeState, setUpgradeState] = useState<
    "idle" | "already_pro" | "redirecting" | "error"
  >("idle");
  const handleUpgradeState = useCallback(
    (s: "idle" | "already_pro" | "redirecting" | "error") => setUpgradeState(s),
    [],
  );

  useUpgradeAction(userData, handleUpgradeState);

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
      <Dialog open={upgradeState === "redirecting"} onClose={() => void 0} closeOnBackdrop={false}>
        <div className="p-6 text-center space-y-4">
          <div className="h-6 w-6 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin mx-auto" />
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-foreground">Upgrading to Pro</h3>
            <p className="text-sm text-foreground/60">Redirecting you to checkout…</p>
          </div>
        </div>
      </Dialog>

      <Dialog open={upgradeState === "already_pro"} onClose={() => setUpgradeState("idle")}>
        <div className="p-5 space-y-4">
          <div className="space-y-2">
            <h3 className="text-base font-semibold text-foreground">Already on Pro</h3>
            <p className="text-sm text-foreground/70 leading-relaxed">
              You're already on the Pro plan. All features are unlocked.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setUpgradeState("idle")}
            className="w-full p-2.5 border border-border bg-foreground text-background text-sm font-medium hover:bg-foreground/90 transition-colors"
          >
            Got it
          </button>
        </div>
      </Dialog>

      <Dialog open={upgradeState === "error"} onClose={() => setUpgradeState("idle")}>
        <div className="p-5 space-y-4">
          <div className="space-y-2">
            <h3 className="text-base font-semibold text-foreground">Checkout Failed</h3>
            <p className="text-sm text-foreground/70 leading-relaxed">
              Failed to start checkout. Please try again.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setUpgradeState("idle")}
            className="w-full p-2.5 border border-border text-sm text-foreground hover:bg-muted/50 transition-colors"
          >
            Close
          </button>
        </div>
      </Dialog>

      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8 lg:px-12">
        <div></div>
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

          {(() => {
            const ownedProjects = (projectsData?.projects ?? []).filter(
              (p) => p.status === "owned" && !p.isArchived,
            );
            if (ownedProjects.length > 0) {
              return ownedProjects.map((project) => (
                <ServiceAccountsCard
                  key={`sa-${project.id}`}
                  projectId={String(project.id)}
                  isOwner={true}
                  hasPro={userData?.hasPro || false}
                />
              ));
            }
            return (
              <ServiceAccountsCard
                projectId=""
                isOwner={false}
                hasPro={userData?.hasPro || false}
              />
            );
          })()}

          <ApiKeysCard
            apiKeys={apiKeysData ?? []}
            projectNames={Object.fromEntries(
              (projectsData?.projects ?? []).map((p) => [String(p.id), p.name]),
            )}
            isLoading={apiKeysData === undefined}
            hasPro={userData?.hasPro || false}
          />
        </div>
      </div>
    </>
  );
}
