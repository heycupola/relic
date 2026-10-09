"use client";

import { api } from "@repo/backend";
import { useAction, useQuery } from "convex/react";
import { Activity, FolderKanban, Share2, Users } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityLogsCard } from "@/components/dashboard/activity-logs-card";
import { ApiKeysCard } from "@/components/dashboard/api-keys-card";
import { GetStartedCard } from "@/components/dashboard/get-started-card";
import { PageHeader } from "@/components/dashboard/page-header";
import { PlanCard, useProCheckout } from "@/components/dashboard/plan-card";
import { CardSkeleton } from "@/components/dashboard/primitives";
import {
  type DashboardProject,
  ProjectsOverviewCard,
} from "@/components/dashboard/projects-overview-card";
import { QuickActionsCard } from "@/components/dashboard/quick-actions-card";
import { ServiceAccountsCard } from "@/components/dashboard/service-accounts-card";
import { type Stat, StatStrip } from "@/components/dashboard/stat-strip";
import { Dialog } from "@/components/dialog";
import { StatusBox } from "@/components/status-box";
import { usePaginatedActionLogs } from "@/hooks/usePaginatedActionLogs";
import { authClient } from "@/lib/auth";
import { formatTimeAgo, pluralize } from "@/lib/format";
import { trackWebEvent } from "@/lib/posthog";
import { primaryButton, secondaryButton } from "@/lib/styles";

type UpgradeState = "idle" | "already_pro" | "redirecting" | "error";

/** Handles `/dashboard?action=upgrade` links coming from the pricing page and the CLI. */
function useUpgradeFromUrl(hasPro: boolean | undefined, onState: (state: UpgradeState) => void) {
  const { startCheckout } = useProCheckout();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current || hasPro === undefined) return;

    const url = new URL(window.location.href);
    if (url.searchParams.get("action") !== "upgrade") return;

    handled.current = true;
    url.searchParams.delete("action");
    window.history.replaceState({}, "", url.toString());

    if (hasPro) {
      onState("already_pro");
      return;
    }

    onState("redirecting");
    void startCheckout().then((result) => {
      if (result !== "redirecting") onState(result);
    });
  }, [hasPro, startCheckout, onState]);
}

interface ProjectLimits {
  used: number;
  included: number;
  hasPro?: boolean;
  freeLimit?: number;
  totalProjects?: number;
}

/** `undefined` while loading, `null` if billing info couldn't be fetched. */
function useProjectLimits(enabled: boolean) {
  const getLimits = useAction(api.project.getLimits);
  const getProjectLimits = useAction(api.project.getProjectLimits);
  const [limits, setLimits] = useState<ProjectLimits | null | undefined>(undefined);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    Promise.all([getLimits({}), getProjectLimits({}).catch(() => null)])
      .then(([base, detail]) => {
        if (cancelled) return;
        setLimits({
          used: base.usage,
          included: base.includedUsage,
          hasPro: detail?.hasPro,
          freeLimit: detail?.freeLimit,
          totalProjects: detail?.totalProjectsCount,
        });
      })
      .catch((error: unknown) => {
        console.error("Failed to fetch project limits:", error);
        if (!cancelled) setLimits(null);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, getLimits, getProjectLimits]);

  return limits;
}

const STATUS_ORDER = { owned: 0, shared: 0, restricted: 1, archived: 2 } as const;

function greeting() {
  const hour = new Date().getHours();
  if (hour < 5) return "Working late";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default function DashboardPage() {
  useEffect(() => {
    trackWebEvent("web_page_viewed", { page: "dashboard" });
  }, []);
  const { data: session } = authClient.useSession();
  const enabled = session?.user ? {} : "skip";

  const userData = useQuery(api.user.getCurrentUser, enabled);
  const projectsData = useQuery(api.project.listUserProjects, enabled);
  const sharedProjectsData = useQuery(
    api.projectShare.listActiveSharedProjectsForCurrentUser,
    enabled,
  );
  const apiKeysData = useQuery(api.apiKey.listApiKeys, enabled);
  const limits = useProjectLimits(!!session?.user);
  const {
    logs: actionLogs,
    isLoading: logsLoading,
    canLoadMore,
    isLoadingMore,
    loadMore,
  } = usePaginatedActionLogs(!!session?.user);

  const [upgradeState, setUpgradeState] = useState<UpgradeState>("idle");
  useUpgradeFromUrl(userData?.hasPro, setUpgradeState);

  const isLoading =
    userData === undefined ||
    projectsData === undefined ||
    sharedProjectsData === undefined ||
    limits === undefined;

  const projects = useMemo<DashboardProject[]>(() => {
    const byId = new Map<string, DashboardProject>();

    for (const p of projectsData?.projects ?? []) {
      byId.set(p.id, {
        id: p.id,
        name: p.name,
        status: p.status,
        isOwner: true,
        shareCount: p.shareUsageCount ?? 0,
        since: p.createdAt,
      });
    }
    for (const s of sharedProjectsData?.shares ?? []) {
      if (byId.has(s.projectId)) continue;
      byId.set(s.projectId, {
        id: s.projectId,
        name: s.projectName,
        status: s.status,
        isOwner: false,
        shareCount: 0,
        ownerName: s.ownerName !== "Unknown" ? s.ownerName : s.ownerEmail,
        since: s.sharedAt,
      });
    }

    return Array.from(byId.values()).sort(
      (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.name.localeCompare(b.name),
    );
  }, [projectsData?.projects, sharedProjectsData?.shares]);

  const hasPro = userData?.hasPro ?? false;
  const ownedActive = projects.filter((p) => p.isOwner && p.status !== "archived");
  const ownedUnlocked = ownedActive.filter((p) => p.status === "owned");
  const sharedWithMe = projects.filter((p) => !p.isOwner && p.status !== "archived");
  const collaborators = ownedActive.reduce((sum, p) => sum + p.shareCount, 0);
  const sharers = new Set(sharedWithMe.map((p) => p.ownerName)).size;
  const activeApiKeys = (apiKeysData ?? []).filter(
    (k) => !k.revokedAt && !(k.expiresAt && k.expiresAt < Date.now()),
  ).length;
  const lastLog = actionLogs[0];

  const projectsUsed = limits?.used ?? ownedActive.length;
  const projectsIncluded = limits?.included || projectsUsed;
  const excessProjects =
    limits?.freeLimit !== undefined && limits.totalProjects !== undefined && !limits.hasPro
      ? Math.max(0, limits.totalProjects - limits.freeLimit)
      : 0;
  const graceDays = projectsData?.isInGracePeriod
    ? projectsData.gracePeriodDaysRemaining
    : undefined;
  const showGraceNotice = graceDays !== undefined;
  const showRestrictedNotice = !showGraceNotice && excessProjects > 0;
  const isNewUser = !isLoading && projects.length === 0;

  const firstName = userData?.name?.trim().split(/\s+/)[0];

  const stats: Stat[] = [
    {
      label: "Projects",
      icon: FolderKanban,
      value: ownedActive.length,
      hint: limits ? `${projectsUsed} of ${projectsIncluded} included` : "",
      hintTone: excessProjects > 0 ? "warning" : undefined,
    },
    {
      label: "Shared with you",
      icon: Share2,
      value: sharedWithMe.length,
      hint: sharedWithMe.length > 0 ? `from ${pluralize(sharers, "person", "people")}` : "none yet",
    },
    {
      label: "Collaborators",
      icon: Users,
      value: collaborators,
      hint: hasPro ? "across your projects" : "Pro feature",
    },
    {
      label: "Last activity",
      icon: Activity,
      value: lastLog ? formatTimeAgo(lastLog.timestamp) : "—",
      hint: lastLog ? (lastLog.projectName ?? "latest change") : "no changes yet",
    },
  ];

  const summary = isLoading
    ? "Loading your workspace…"
    : isNewUser
      ? "Welcome to Relic. Let's get your first secrets encrypted."
      : `${pluralize(ownedUnlocked.length, "active project")}${
          sharedWithMe.length > 0 ? `, ${sharedWithMe.length} shared with you` : ""
        }. Everything is end-to-end encrypted.`;

  return (
    <>
      <Dialog open={upgradeState === "redirecting"} onClose={() => void 0} closeOnBackdrop={false}>
        <div className="space-y-4 p-6 text-center">
          <div
            className="mx-auto size-6 animate-spin rounded-full border-2 border-foreground/20 border-t-foreground motion-reduce:animate-none"
            aria-hidden="true"
          />
          <div className="space-y-1" role="status">
            <h2 className="text-base font-semibold text-foreground">Upgrading to Pro</h2>
            <p className="text-sm text-foreground/60">Redirecting you to checkout…</p>
          </div>
        </div>
      </Dialog>

      <Dialog open={upgradeState === "already_pro"} onClose={() => setUpgradeState("idle")}>
        <div className="space-y-4 p-5">
          <div className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">You're already on Pro</h2>
            <p className="text-sm leading-relaxed text-foreground/70">
              All Pro features are unlocked on your account.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setUpgradeState("idle")}
            className={`w-full p-2.5 text-sm ${primaryButton}`}
          >
            Got it
          </button>
        </div>
      </Dialog>

      <Dialog open={upgradeState === "error"} onClose={() => setUpgradeState("idle")}>
        <div className="space-y-4 p-5">
          <div className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">Checkout failed</h2>
            <p className="text-sm leading-relaxed text-foreground/70">
              We couldn't start checkout. Please try again in a moment.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setUpgradeState("idle")}
            className={`w-full p-2.5 text-sm ${secondaryButton}`}
          >
            Close
          </button>
        </div>
      </Dialog>

      <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8 sm:space-y-8 sm:px-6 sm:py-10 lg:px-12">
        <PageHeader
          eyebrow={`~/dashboard`}
          title={firstName ? `${greeting()}, ${firstName}` : greeting()}
          description={summary}
        />

        {(showGraceNotice || showRestrictedNotice) && (
          <div className="space-y-3">
            {showGraceNotice && (
              <StatusBox variant="warning">
                <h2 className="text-sm font-medium text-foreground">Your Pro plan has ended</h2>
                <p className="mt-1 text-pretty">
                  Everything stays unlocked for {pluralize(graceDays ?? 0, "more day")}. After that
                  only the projects included in the Free plan stay available
                  {excessProjects > 0
                    ? `, so archive ${pluralize(excessProjects, "project")} or upgrade to keep full access.`
                    : "."}
                </p>
              </StatusBox>
            )}
            {showRestrictedNotice && (
              <StatusBox variant="warning">
                <h2 className="text-sm font-medium text-foreground">Some projects are locked</h2>
                <p className="mt-1 text-pretty">
                  The Free plan includes {pluralize(limits?.freeLimit ?? 0, "project")}. Archive{" "}
                  {pluralize(excessProjects, "project")} or upgrade to Pro to unlock them again.
                </p>
              </StatusBox>
            )}
          </div>
        )}

        <StatStrip stats={stats} isLoading={isLoading || logsLoading} />

        {isNewUser && <GetStartedCard />}

        <div className="grid grid-cols-1 items-start gap-4 sm:gap-5 lg:grid-cols-3">
          <div className="min-w-0 space-y-4 sm:space-y-5 lg:col-span-2">
            {isLoading ? (
              <CardSkeleton label="projects" rows={3} />
            ) : (
              !isNewUser && <ProjectsOverviewCard projects={projects} />
            )}
            {logsLoading ? (
              <CardSkeleton label="activity" rows={5} />
            ) : (
              <ActivityLogsCard
                logs={actionLogs}
                canLoadMore={canLoadMore}
                isLoadingMore={isLoadingMore}
                onLoadMore={loadMore}
              />
            )}
          </div>
          <aside className="min-w-0 space-y-4 sm:space-y-5" aria-label="Plan and tools">
            {isLoading ? (
              <CardSkeleton label="plan" rows={2} />
            ) : (
              <PlanCard
                hasPro={hasPro}
                projectsUsed={projectsUsed}
                projectsIncluded={projectsIncluded}
                activeApiKeys={activeApiKeys}
              />
            )}
            <QuickActionsCard />
          </aside>
        </div>

        <section aria-labelledby="machine-access-heading" className="space-y-4 sm:space-y-5">
          <div className="flex items-center gap-4">
            <div className="space-y-0.5">
              <h2
                id="machine-access-heading"
                className="font-[family-name:var(--font-space-grotesk)] text-lg font-semibold text-foreground"
              >
                Machine access
              </h2>
              <p className="text-sm text-foreground/60">
                Credentials for CI/CD, scripts, and integrations.
              </p>
            </div>
            <div className="h-px flex-1 bg-border" aria-hidden="true" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:gap-5">
            {isLoading ? (
              <CardSkeleton label="service accounts" rows={2} />
            ) : (
              <ServiceAccountsCard
                hasPro={hasPro}
                projects={ownedUnlocked.map((p) => ({ id: p.id, name: p.name }))}
              />
            )}
            <ApiKeysCard
              apiKeys={apiKeysData ?? []}
              projectNames={Object.fromEntries(
                (projectsData?.projects ?? []).map((p) => [String(p.id), p.name]),
              )}
              isLoading={apiKeysData === undefined || userData === undefined}
              hasPro={hasPro}
            />
          </div>
        </section>
      </div>
    </>
  );
}
