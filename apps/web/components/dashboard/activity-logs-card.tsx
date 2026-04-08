"use client";

import {
  Archive,
  Bot,
  Check,
  FolderPlus,
  Key,
  LogOut,
  Pencil,
  Plus,
  Shield,
  Trash2,
  Upload,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useEffect, useRef } from "react";

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
  };
}

interface ActivityLogsCardProps {
  logs: ActionLog[];
  isLoading?: boolean;
  canLoadMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
}

function formatTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "just now";
}

function getActionColor(action: string): string {
  if (action.includes("deleted") || action.includes("revoked") || action === "account.deleted")
    return "text-red-600 dark:text-red-400";
  if (action.includes("archived")) return "text-orange-600 dark:text-orange-400";
  if (action.includes("created") || action.includes("unarchived"))
    return "text-green-600 dark:text-green-400";
  if (action.includes("updated") || action.includes("rotated") || action.includes("changed"))
    return "text-yellow-600 dark:text-yellow-400";
  if (action.includes("added")) return "text-blue-600 dark:text-blue-400";
  if (action.includes("exported")) return "text-purple-600 dark:text-purple-400";
  return "text-foreground";
}

function getActionIcon(action: string) {
  if (action === "account.deleted") return LogOut;
  if (action === "serviceaccount.oidc_updated") return Shield;
  if (action.startsWith("serviceaccount.")) return Bot;
  if (action.includes("folder.created")) return FolderPlus;
  if (action.includes("archived")) return Archive;
  if (action.includes("created") || action.includes("unarchived")) return Plus;
  if (action.includes("updated") || action.includes("changed")) return Pencil;
  if (action.includes("deleted")) return Trash2;
  if (action.includes("revoked")) return X;
  if (action.includes("added")) return UserPlus;
  if (action.includes("exported")) return Upload;
  if (action.includes("rotated")) return Key;
  if (action === "share.key_updated") return Key;
  if (action === "onboarding.completed") return Check;
  if (action === "user.keys_created") return Key;
  return null;
}

function formatActionDescription(log: ActionLog): string {
  const parts: string[] = [];

  switch (log.action) {
    case "secret.created":
      parts.push("secret created");
      if (log.metadata?.key) parts.push(`(${log.metadata.key})`);
      if (log.metadata?.folderName) parts.push(`in ${log.metadata.folderName}/`);
      break;
    case "secret.updated":
      parts.push("secret updated");
      if (log.metadata?.key) parts.push(`(${log.metadata.key})`);
      if (log.metadata?.folderName) parts.push(`in ${log.metadata.folderName}/`);
      break;
    case "secret.deleted":
      parts.push("secret deleted");
      if (log.metadata?.key) parts.push(`(${log.metadata.key})`);
      if (log.metadata?.folderName) parts.push(`in ${log.metadata.folderName}/`);
      break;
    case "secret.exported":
      parts.push("secrets exported");
      if (log.metadata?.exportCount) parts.push(`(${log.metadata.exportCount} items)`);
      break;
    case "secrets.bulk.updated":
      parts.push("bulk update");
      if (log.metadata?.affectedValueCount)
        parts.push(`(${log.metadata.affectedValueCount} secrets)`);
      break;
    case "secrets.bulk_deleted":
      parts.push("bulk delete");
      if (log.metadata?.deleteCount) parts.push(`(${log.metadata.deleteCount} secrets)`);
      break;
    case "secrets.bulk_exported":
      parts.push("bulk export");
      if (log.metadata?.exportCount) parts.push(`(${log.metadata.exportCount} items)`);
      break;
    case "share.added":
      parts.push("collaborator added");
      if (log.metadata?.sharedUserEmail) parts.push(`(${log.metadata.sharedUserEmail})`);
      break;
    case "share.revoked":
      parts.push("collaborator removed");
      if (log.metadata?.sharedUserEmail) parts.push(`(${log.metadata.sharedUserEmail})`);
      break;
    case "share.key_updated":
      parts.push("share key updated");
      break;
    case "user.keys_created":
      parts.push("encryption keys created");
      break;
    case "user.password_changed":
      parts.push("password changed");
      break;
    case "project.created":
      parts.push("project created");
      break;
    case "project.updated":
      parts.push("project updated");
      break;
    case "project.archived":
      parts.push("project archived");
      break;
    case "project.unarchived":
      parts.push("project unarchived");
      break;
    case "project.key_rotated":
    case "keys.rotated":
      parts.push("keys rotated");
      break;
    case "environment.created":
      parts.push("environment created");
      break;
    case "environment.updated":
      parts.push("environment updated");
      break;
    case "environment.deleted":
      parts.push("environment deleted");
      if (log.metadata?.environmentName) parts.push(`(${log.metadata.environmentName})`);
      break;
    case "folder.created":
      parts.push("folder created");
      if (log.metadata?.folderName) parts.push(`(${log.metadata.folderName}/)`);
      break;
    case "folder.updated":
      parts.push("folder updated");
      if (log.metadata?.folderName) parts.push(`(${log.metadata.folderName}/)`);
      break;
    case "folder.deleted":
      parts.push("folder deleted");
      if (log.metadata?.folderName) parts.push(`(${log.metadata.folderName}/)`);
      break;
    case "apikey.created":
      parts.push("API key created");
      if (log.metadata?.apiKeyPrefix) parts.push(`(${log.metadata.apiKeyPrefix}…)`);
      break;
    case "apikey.revoked":
      parts.push("API key revoked");
      if (log.metadata?.apiKeyPrefix) parts.push(`(${log.metadata.apiKeyPrefix}…)`);
      break;
    case "serviceaccount.created":
      parts.push("service account created");
      if (log.metadata?.apiKeyPrefix) parts.push(`(${log.metadata.apiKeyPrefix}…)`);
      break;
    case "serviceaccount.revoked":
      parts.push("service account revoked");
      if (log.metadata?.apiKeyPrefix) parts.push(`(${log.metadata.apiKeyPrefix}…)`);
      break;
    case "serviceaccount.oidc_updated":
      parts.push("OIDC policy updated");
      if (log.metadata?.apiKeyPrefix) parts.push(`(${log.metadata.apiKeyPrefix}…)`);
      break;
    case "account.deleted":
      parts.push("account deleted");
      break;
    case "onboarding.completed":
      parts.push("onboarding completed");
      break;
    default:
      parts.push(log.action.replace(/[._]/g, " "));
  }

  return parts.join(" ");
}

function formatContext(log: ActionLog): string | null {
  const segments: string[] = [];

  if (log.projectName) segments.push(log.projectName);
  if (log.environmentName) segments.push(log.environmentName);

  return segments.length > 0 ? segments.join(" / ") : null;
}

export function ActivityLogsCard({
  logs,
  isLoading,
  canLoadMore,
  isLoadingMore,
  onLoadMore,
}: ActivityLogsCardProps) {
  const observerTarget = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!canLoadMore || !onLoadMore || !observerTarget.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && canLoadMore && !isLoadingMore) {
          onLoadMore();
        }
      },
      { threshold: 0.1 },
    );

    observer.observe(observerTarget.current);

    return () => observer.disconnect();
  }, [canLoadMore, isLoadingMore, onLoadMore]);
  if (isLoading) {
    return (
      <div className="border-2 border-border bg-card p-5">
        <div className="animate-pulse space-y-3">
          {[...Array(5)].map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: Static skeleton loading doesn't reorder
            <div key={`skeleton-${i}`} className="h-4 bg-muted rounded w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="border-2 border-border bg-card p-5">
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-foreground/60">Recent Activity</h3>
          <p className="text-sm text-foreground/50">No activity yet</p>
        </div>
      </div>
    );
  }

  return (
    <div className="border-2 border-border bg-card p-4 sm:p-5">
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-foreground/60">Recent Activity</h3>
        <div className="relative max-h-[300px] overflow-y-auto sm:max-h-[400px] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-border/20 [&::-webkit-scrollbar-thumb]:bg-foreground/20 [&::-webkit-scrollbar-thumb]:hover:bg-foreground/30">
          <ul className="space-y-0 divide-y divide-border/50">
            {logs.map((log) => {
              const ActionIcon = getActionIcon(log.action);
              const context = formatContext(log);
              return (
                <li key={log._id} className="py-2 first:pt-0 sm:py-2.5">
                  <div className="flex items-start gap-2 sm:gap-3">
                    <span className="text-foreground/40 select-none shrink-0 text-[11px] font-mono mt-0.5 sm:text-xs">
                      {formatTimeAgo(log.timestamp)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-2 flex-wrap text-sm">
                        <span className={`flex items-center gap-1.5 ${getActionColor(log.action)}`}>
                          {ActionIcon && (
                            <ActionIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          )}
                          {formatActionDescription(log)}
                        </span>
                        {context && (
                          <>
                            <span className="text-foreground/30">·</span>
                            <span className="text-foreground/60">{context}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          {canLoadMore && (
            <div ref={observerTarget} className="py-3 text-center border-t border-border/50">
              {isLoadingMore ? (
                <span className="text-xs text-foreground/40">Loading more…</span>
              ) : (
                <button
                  type="button"
                  onClick={onLoadMore}
                  className="text-xs text-foreground/50 hover:text-foreground transition-colors cursor-pointer"
                >
                  Load more
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
