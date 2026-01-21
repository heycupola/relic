"use client";

import { api } from "@repo/backend";
import { useAction, useQuery } from "convex/react";
import { AlertCircle } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ContainerLines } from "@/components/container-lines";
import { ActivityLogsCard } from "@/components/dashboard/activity-logs-card";
import { ProjectsOverviewCard } from "@/components/dashboard/projects-overview-card";
import { QuickActionsCard } from "@/components/dashboard/quick-actions-card";
import { UserInfoCard } from "@/components/dashboard/user-info-card";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { usePaginatedActionLogs } from "@/hooks/usePaginatedActionLogs";
import { authClient } from "@/lib/auth";

export default function DashboardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, isPending: sessionPending } = authClient.useSession();

  // Fetch user data
  const userData = useQuery(api.user.getCurrentUser, session?.user ? {} : "skip");
  const projectsData = useQuery(api.project.listUserProjects, session?.user ? {} : "skip");
  const sharedProjectsData = useQuery(
    api.projectShare.listActiveSharedProjectsForCurrentUser,
    session?.user ? {} : "skip",
  );

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
  const getProPlanAction = useAction(api.user.getProPlan);
  const [limitsData, setLimitsData] = useState<{ usage: number; includedUsage: number } | null>(
    null,
  );
  const [projectLimitsData, setProjectLimitsData] = useState<{
    totalProjectsCount: number;
    includedUsage: number;
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

  // Check auth and redirect if needed
  useEffect(() => {
    if (sessionPending) return;
    if (!session?.user) {
      router.replace("/login?returnUrl=/dashboard");
    }
  }, [session, sessionPending, router]);

  const [upgradeError, setUpgradeError] = useState<string>("");

  // Handle upgrade action from pricing page
  useEffect(() => {
    const action = searchParams.get("action");

    if (action === "upgrade" && userData && !userData.hasPro) {
      const handleUpgrade = async () => {
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
          setUpgradeError("Failed to start checkout. Please try again.");
          // Clean the URL even on error
          const url = new URL(window.location.href);
          url.searchParams.delete("action");
          window.history.replaceState({}, "", url.toString());
        }
      };

      handleUpgrade();
    }
  }, [searchParams, userData, getProPlanAction]);

  // Show nothing while checking auth or redirecting
  if (sessionPending || !session?.user) {
    return null;
  }

  const isLoading =
    userData === undefined ||
    projectsData === undefined ||
    sharedProjectsData === undefined ||
    logsLoading ||
    limitsLoading;

  // Combine owned and shared projects
  const allProjects = [
    ...(projectsData?.projects || []).map((p) => ({
      id: p.id,
      name: p.name,
      status: p.status as "owned" | "shared" | "restricted" | "archived",
      shareCount: p.shareUsageCount || 0,
    })),
    ...(sharedProjectsData?.shares || []).map((s) => ({
      id: s.projectId,
      name: s.projectName,
      status: "shared" as const,
      shareCount: 0,
    })),
  ];

  const isOverProjectLimit =
    projectLimitsData && projectLimitsData.totalProjectsCount > projectLimitsData.includedUsage;
  const excessProjects = isOverProjectLimit
    ? projectLimitsData.totalProjectsCount - projectLimitsData.includedUsage
    : 0;

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <ContainerLines />
      <div className="flex flex-col min-h-dvh">
        <Header showLogout />
        <main className="mx-auto max-w-6xl px-6 py-8 lg:px-12 flex-1 w-full">
          <div className="sr-only" role="alert" aria-live="assertive" aria-atomic="true">
            {upgradeError}
          </div>
          <div className="space-y-5">
            {isOverProjectLimit && (
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 p-4 rounded-lg">
                <div className="flex items-start gap-3">
                  <AlertCircle
                    className="h-5 w-5 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                  <div className="flex-1">
                    <h3 className="font-medium text-yellow-900 dark:text-yellow-100 text-sm">
                      Usage limit exceeded
                    </h3>
                    <p className="text-sm text-yellow-800 dark:text-yellow-200 mt-1 text-pretty">
                      You're using {projectLimitsData.totalProjectsCount} projects but only have{" "}
                      {projectLimitsData.includedUsage} included. Please archive {excessProjects}{" "}
                      project(s) or upgrade your plan.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Top row - User Info and Projects */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
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
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <QuickActionsCard />
              <ActivityLogsCard
                logs={actionLogs}
                isLoading={isLoading}
                canLoadMore={canLoadMore}
                isLoadingMore={isLoadingMore}
                onLoadMore={loadMore}
              />
            </div>
          </div>
        </main>
        <Footer />
      </div>
    </div>
  );
}
