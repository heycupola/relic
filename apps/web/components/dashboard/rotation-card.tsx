"use client";

import { formatRotationAge } from "@repo/backend";
import { AlertTriangle, Clock, RefreshCw } from "lucide-react";
import { DashboardCard, EmptyState, thinScrollbar, tone } from "./primitives";

interface RotationAlert {
  secretId: string;
  key: string;
  projectId: string;
  projectName: string;
  environmentName: string;
  folderName: string | null;
  ageDays: number;
  rotateEveryDays: number | null;
  policySource: "secret" | "environment" | null;
  status: "ok" | "due_soon" | "overdue" | "no_policy";
  daysUntilDue: number | null;
}

interface RotationCardProps {
  alerts: {
    items: RotationAlert[];
    overdueCount: number;
    dueSoonCount: number;
    truncated: boolean;
  };
}

function formatDue(alert: RotationAlert) {
  if (alert.daysUntilDue === null) return null;
  if (alert.daysUntilDue < 0) return `${-alert.daysUntilDue}d overdue`;
  if (alert.daysUntilDue === 0) return "due today";
  return `due in ${alert.daysUntilDue}d`;
}

export function RotationCard({ alerts }: RotationCardProps) {
  const { items, overdueCount, dueSoonCount, truncated } = alerts;

  return (
    <DashboardCard
      eyebrow="rotation"
      title="Secret rotation"
      action={
        items.length > 0 && (
          <span className="flex items-center gap-2 font-mono text-xs tabular-nums">
            <span className={tone.danger}>{overdueCount} overdue</span>
            <span className="text-foreground/20">·</span>
            <span className={tone.warning}>{dueSoonCount} due soon</span>
          </span>
        )
      }
      footer={
        truncated && (
          <>
            Showing the first {items.length}. Run{" "}
            <code className="font-mono text-foreground">relic rotation status</code> per project
            for the full list.
          </>
        )
      }
      bodyClassName={items.length > 0 ? "p-0 sm:p-0" : undefined}
    >
      {items.length === 0 ? (
        <EmptyState icon={RefreshCw} title="Nothing due for rotation">
          Set a policy with{" "}
          <code className="font-mono">relic rotation set -e production --every 90</code>
        </EmptyState>
      ) : (
        <ul className={`max-h-[320px] divide-y divide-border overflow-y-auto ${thinScrollbar}`}>
          {items.map((alert) => {
            const isOverdue = alert.status === "overdue";
            const StatusIcon = isOverdue ? AlertTriangle : Clock;
            return (
              <li
                key={alert.secretId}
                className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5"
              >
                <div className="min-w-0">
                  <span className="block truncate font-mono text-sm text-foreground">
                    {alert.folderName ? `${alert.folderName}/${alert.key}` : alert.key}
                  </span>
                  <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="truncate">{alert.projectName}</span>
                    <span className="text-foreground/20">·</span>
                    <span className="truncate">{alert.environmentName}</span>
                    {alert.rotateEveryDays !== null && (
                      <>
                        <span className="text-foreground/20">·</span>
                        <span className="whitespace-nowrap">
                          every {alert.rotateEveryDays}d
                          {alert.policySource === "environment" ? " (env)" : ""}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end text-xs">
                  <span
                    className={`flex items-center gap-1 whitespace-nowrap ${
                      isOverdue ? tone.danger : tone.warning
                    }`}
                  >
                    <StatusIcon className="size-3 shrink-0" aria-hidden="true" />
                    {formatDue(alert)}
                  </span>
                  <span className="mt-0.5 tabular-nums text-muted-foreground">
                    age {formatRotationAge(alert.ageDays)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </DashboardCard>
  );
}
