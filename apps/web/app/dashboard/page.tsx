"use client";

import { api } from "@repo/backend";
import { useAction, useQuery } from "convex/react";
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

  // Fetch limits using action
  const getLimitsAction = useAction(api.project.getLimits);
  const getProPlanAction = useAction(api.user.getProPlan);
  const [limitsData, setLimitsData] = useState<{ usage: number; includedUsage: number } | null>(
    null,
  );
  const [limitsLoading, setLimitsLoading] = useState(true);

  useEffect(() => {
    if (!session?.user) return;

    getLimitsAction({})
      .then((data) => {
        setLimitsData(data);
        setLimitsLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch limits:", err);
        setLimitsLoading(false);
      });
  }, [session?.user, getLimitsAction]);

  // Check auth and redirect if needed
  useEffect(() => {
    if (sessionPending) return;
    if (!session?.user) {
      router.replace("/login?returnUrl=/dashboard");
    }
  }, [session, sessionPending, router]);

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

  return (
    <div className="min-h-screen bg-background text-foreground">
      <ContainerLines />
      <div className="flex flex-col min-h-screen">
        <Header showLogout />
        <main className="mx-auto max-w-6xl px-6 py-8 lg:px-12 flex-1 w-full">
          <div className="space-y-5">
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
              <QuickActionsCard hasPro={userData?.hasPro || false} />
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
