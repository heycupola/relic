"use client";

import { cn } from "@repo/ui/lib/utils";
import {
  Activity,
  Archive,
  Bot,
  Check,
  FileDown,
  FolderPlus,
  Key,
  KeyRound,
  Layers,
  type LucideIcon,
  Pencil,
  Plus,
  RotateCcw,
  Shield,
  Trash2,
  UserMinus,
  UserPlus,
  Upload,
  UserX,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatClockTime, formatDateTime, formatDayLabel, formatTimeAgo } from "@/lib/format";
import { focusRing } from "@/lib/styles";
import {
  DashboardCard,
  EmptyState,
  SegmentedTabs,
  type Tone,
  thinScrollbar,
  tone,
} from "./primitives";

interface ActionLog {
  _id: string;
  action: string;
  projectName?: string;
  environmentName?: string;
  timestamp: number;
  metadata?: {
    key?: string;
    newKey?: string;
    folderName?: string;
    environmentName?: string;
    sharedUserEmail?: string;
    deleteCount?: number;
    exportCount?: number;
    affectedValueCount?: number;
    keyRotated?: boolean;
    exportFormat?: string;
    reason?: string;
    apiKeyPrefix?: string;
    pushTarget?: string;
    pushDestination?: string;
    pushDryRun?: boolean;
    restoredVersion?: number;
    wasDeleted?: boolean;
  };
}

interface ActivityLogsCardProps {
  logs: ActionLog[];
  isLoading?: boolean;
  canLoadMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
}

type Category = "all" | "secrets" | "projects" | "team" | "access";

interface Described {
  text: string;
  /** Rendered in mono after the text, e.g. a secret key or an email. */
  subject?: string;
  icon: LucideIcon;
  tone: Tone;
  category: Exclude<Category, "all">;
}

function count(n: number | undefined, noun: string) {
  return n ? `${n} ${noun}${n === 1 ? "" : "s"}` : undefined;
}

function prefix(p: string | undefined) {
  return p ? `${p}…` : undefined;
}

const PUSH_TARGET_LABELS: Record<string, string> = {
  vercel: "Vercel",
  cloudflare: "Cloudflare",
  github: "GitHub Actions",
  fly: "Fly.io",
};

function describe(log: ActionLog): Described {
  const m = log.metadata ?? {};
  switch (log.action) {
    case "secret.created":
      return {
        text: "Secret created",
        subject: m.key,
        icon: Plus,
        tone: "success",
        category: "secrets",
      };
    case "secret.updated":
      return {
        text: "Secret updated",
        subject: m.newKey ?? m.key,
        icon: Pencil,
        tone: "warning",
        category: "secrets",
      };
    case "secret.deleted":
      return {
        text: "Secret deleted",
        subject: m.key,
        icon: Trash2,
        tone: "danger",
        category: "secrets",
      };
    case "secret.restored":
      return {
        text: [
          m.wasDeleted ? "Deleted secret restored" : "Secret restored",
          m.restoredVersion && `to v${m.restoredVersion}`,
        ]
          .filter(Boolean)
          .join(" "),
        subject: m.key,
        icon: RotateCcw,
        tone: "success",
        category: "secrets",
      };
    case "secret.exported":
    case "secrets.bulk_exported":
      return {
        text: "Secrets exported",
        subject: count(m.exportCount, "item"),
        icon: FileDown,
        tone: "accent",
        category: "secrets",
      };
    case "secrets.pushed": {
      const target = m.pushTarget && (PUSH_TARGET_LABELS[m.pushTarget] ?? m.pushTarget);
      const verb = m.pushDryRun ? "Push planned (dry run)" : "Secrets pushed";
      return {
        text: target ? `${verb} to ${target}` : verb,
        subject: m.pushDestination ?? count(m.exportCount, "item"),
        icon: Upload,
        tone: "accent",
        category: "secrets",
      };
    }
    case "secrets.bulk.updated":
      return {
        text: "Bulk update",
        subject: count(m.affectedValueCount, "secret"),
        icon: Layers,
        tone: "warning",
        category: "secrets",
      };
    case "secrets.bulk_deleted":
      return {
        text: "Bulk delete",
        subject: count(m.deleteCount, "secret"),
        icon: Trash2,
        tone: "danger",
        category: "secrets",
      };
    case "share.added":
      return {
        text: "Collaborator added",
        subject: m.sharedUserEmail,
        icon: UserPlus,
        tone: "info",
        category: "team",
      };
    case "share.revoked":
      return {
        text: "Collaborator removed",
        subject: m.sharedUserEmail,
        icon: UserMinus,
        tone: "danger",
        category: "team",
      };
    case "share.key_updated":
      return { text: "Collaborator key updated", icon: Key, tone: "warning", category: "team" };
    case "project.created":
      return { text: "Project created", icon: Plus, tone: "success", category: "projects" };
    case "project.updated":
      return { text: "Project updated", icon: Pencil, tone: "warning", category: "projects" };
    case "project.archived":
      return { text: "Project archived", icon: Archive, tone: "muted", category: "projects" };
    case "project.unarchived":
      return { text: "Project restored", icon: Archive, tone: "success", category: "projects" };
    case "project.key_rotated":
    case "keys.rotated":
      return { text: "Keys rotated", icon: Key, tone: "warning", category: "projects" };
    case "environment.created":
      return { text: "Environment created", icon: Plus, tone: "success", category: "projects" };
    case "environment.updated":
      return { text: "Environment updated", icon: Pencil, tone: "warning", category: "projects" };
    case "environment.deleted":
      return {
        text: "Environment deleted",
        subject: m.environmentName,
        icon: Trash2,
        tone: "danger",
        category: "projects",
      };
    case "folder.created":
      return {
        text: "Folder created",
        subject: m.folderName && `${m.folderName}/`,
        icon: FolderPlus,
        tone: "success",
        category: "projects",
      };
    case "folder.updated":
      return {
        text: "Folder updated",
        subject: m.folderName && `${m.folderName}/`,
        icon: Pencil,
        tone: "warning",
        category: "projects",
      };
    case "folder.deleted":
      return {
        text: "Folder deleted",
        subject: m.folderName && `${m.folderName}/`,
        icon: Trash2,
        tone: "danger",
        category: "projects",
      };
    case "apikey.created":
      return {
        text: "API key created",
        subject: prefix(m.apiKeyPrefix),
        icon: KeyRound,
        tone: "success",
        category: "access",
      };
    case "apikey.revoked":
      return {
        text: "API key revoked",
        subject: prefix(m.apiKeyPrefix),
        icon: KeyRound,
        tone: "danger",
        category: "access",
      };
    case "serviceaccount.created":
      return {
        text: "Service account created",
        subject: prefix(m.apiKeyPrefix),
        icon: Bot,
        tone: "success",
        category: "access",
      };
    case "serviceaccount.revoked":
      return {
        text: "Service account revoked",
        subject: prefix(m.apiKeyPrefix),
        icon: Bot,
        tone: "danger",
        category: "access",
      };
    case "serviceaccount.oidc_updated":
      return {
        text: "OIDC policy updated",
        subject: prefix(m.apiKeyPrefix),
        icon: Shield,
        tone: "accent",
        category: "access",
      };
    case "user.keys_created":
      return { text: "Encryption keys created", icon: Key, tone: "success", category: "access" };
    case "user.password_changed":
      return { text: "Password changed", icon: Key, tone: "warning", category: "access" };
    case "account.deleted":
      return { text: "Account deleted", icon: UserX, tone: "danger", category: "access" };
    case "onboarding.completed":
      return { text: "Onboarding completed", icon: Check, tone: "success", category: "access" };
    default: {
      const text = log.action.replace(/[._]/g, " ");
      return {
        text: text.charAt(0).toUpperCase() + text.slice(1),
        icon: Activity,
        tone: "muted",
        category: "projects",
      };
    }
  }
}

function contextOf(log: ActionLog) {
  const parts = [log.projectName, log.environmentName ?? log.metadata?.environmentName];
  const location = parts.filter(Boolean).join(" / ");
  const folder = log.metadata?.folderName;
  if (folder && !log.action.startsWith("folder.")) {
    return location ? `${location} · ${folder}/` : `${folder}/`;
  }
  return location || null;
}

const DAY_MS = 86_400_000;

export function ActivityLogsCard({
  logs,
  isLoading,
  canLoadMore,
  isLoadingMore,
  onLoadMore,
}: ActivityLogsCardProps) {
  const [category, setCategory] = useState<Category>("all");
  const observerTarget = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = observerTarget.current;
    if (!canLoadMore || !onLoadMore || !target) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isLoadingMore) onLoadMore();
      },
      { threshold: 0.1 },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [canLoadMore, isLoadingMore, onLoadMore]);

  const groups = useMemo(() => {
    const now = Date.now();
    const result: { label: string; items: { log: ActionLog; d: Described }[] }[] = [];
    for (const log of logs) {
      const d = describe(log);
      if (category !== "all" && d.category !== category) continue;
      const label = formatDayLabel(log.timestamp, now);
      const last = result[result.length - 1];
      if (last?.label === label) last.items.push({ log, d });
      else result.push({ label, items: [{ log, d }] });
    }
    return result;
  }, [logs, category]);

  if (isLoading) return null;

  return (
    <DashboardCard
      eyebrow="activity"
      title="Recent activity"
      description="An audit trail of changes across your projects."
      bodyClassName="p-0 sm:p-0"
    >
      {logs.length === 0 ? (
        <div className="p-4 sm:p-5">
          <EmptyState icon={Activity} title="No activity yet">
            Changes to secrets, projects, collaborators, and keys will appear here.
          </EmptyState>
        </div>
      ) : (
        <>
          <div className="border-b border-border px-4 py-3 sm:px-5">
            <SegmentedTabs
              label="Filter activity"
              value={category}
              onChange={setCategory}
              options={[
                { value: "all", label: "All" },
                { value: "secrets", label: "Secrets" },
                { value: "projects", label: "Projects" },
                { value: "team", label: "Team" },
                { value: "access", label: "Keys & access" },
              ]}
            />
          </div>
          <div className={cn("max-h-[420px] overflow-y-auto", thinScrollbar)}>
            {groups.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground sm:px-5">
                No matching activity in what's loaded so far.
              </p>
            ) : (
              groups.map((group) => (
                <section key={group.label} aria-label={group.label}>
                  <h3 className="sticky top-0 z-10 border-b border-border bg-card/95 px-4 py-1.5 font-mono text-[11px] text-muted-foreground backdrop-blur-sm sm:px-5">
                    {group.label}
                  </h3>
                  <ul className="divide-y divide-border/70">
                    {group.items.map(({ log, d }) => (
                      <ActivityRow key={log._id} log={log} d={d} />
                    ))}
                  </ul>
                </section>
              ))
            )}
            {canLoadMore && (
              <div ref={observerTarget} className="border-t border-border py-3 text-center">
                {isLoadingMore ? (
                  <span className="text-xs text-muted-foreground">Loading more…</span>
                ) : (
                  <button
                    type="button"
                    onClick={onLoadMore}
                    className={`text-xs text-muted-foreground transition-colors hover:text-foreground ${focusRing}`}
                  >
                    Load older activity
                  </button>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </DashboardCard>
  );
}

function ActivityRow({ log, d }: { log: ActionLog; d: Described }) {
  const Icon = d.icon;
  const context = contextOf(log);
  const isRecent = Date.now() - log.timestamp < DAY_MS;

  return (
    <li className="flex items-start gap-3 px-4 py-2.5 sm:px-5">
      <span
        className="mt-0.5 flex size-6 shrink-0 items-center justify-center border border-border bg-muted/20"
        aria-hidden="true"
      >
        <Icon className={cn("size-3", tone[d.tone])} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-foreground">
          {d.text}
          {d.subject && (
            <>
              {" "}
              <code className="break-all font-mono text-xs text-foreground/70">{d.subject}</code>
            </>
          )}
        </p>
        {context && <p className="truncate text-xs text-muted-foreground">{context}</p>}
      </div>
      <time
        dateTime={new Date(log.timestamp).toISOString()}
        title={formatDateTime(log.timestamp)}
        className="mt-0.5 shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground"
      >
        {isRecent ? formatTimeAgo(log.timestamp) : formatClockTime(log.timestamp)}
      </time>
    </li>
  );
}
