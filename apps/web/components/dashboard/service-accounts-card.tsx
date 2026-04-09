"use client";

import type { Id } from "@repo/backend";
import { api } from "@repo/backend";
import { Badge } from "@repo/ui/components/badge";
import { useQuery } from "convex/react";
import { Bot, Shield, Terminal } from "lucide-react";
import { useState } from "react";
import { OidcPolicyDialog } from "./oidc-policy-dialog";
import { RevokeServiceAccountDialog } from "./revoke-service-account-dialog";
import { UpgradeToProDialog } from "./upgrade-pro-dialog";

export interface ServiceAccountItem {
  id: Id<"serviceAccount">;
  name: string;
  tokenPrefix: string;
  oidcIssuer?: string;
  oidcSubjectPattern?: string;
  oidcAudience?: string;
  expiresAt?: number;
  revokedAt?: number;
  lastUsedAt?: number;
  createdAt: number;
}

interface ServiceAccountsCardProps {
  projectId: string;
  isOwner: boolean;
  hasPro: boolean;
}

function getStatus(sa: ServiceAccountItem): "active" | "revoked" | "expired" {
  if (sa.revokedAt) return "revoked";
  if (sa.expiresAt && sa.expiresAt < Date.now()) return "expired";
  return "active";
}

function getStatusColor(status: ReturnType<typeof getStatus>) {
  switch (status) {
    case "active":
      return "text-green-600 dark:text-green-400";
    case "revoked":
      return "text-red-600 dark:text-red-400";
    case "expired":
      return "text-yellow-600 dark:text-yellow-400";
  }
}

function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "just now";
}

export function ServiceAccountsCard({ projectId, isOwner, hasPro }: ServiceAccountsCardProps) {
  const accounts = useQuery(
    api.serviceAccount.listServiceAccounts,
    hasPro ? { projectId: projectId as Id<"project"> } : "skip",
  );
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [saToRevoke, setSaToRevoke] = useState<ServiceAccountItem | null>(null);
  const [saToConfigOidc, setSaToConfigOidc] = useState<ServiceAccountItem | null>(null);

  const isLoading = accounts === undefined;
  const visibleAccounts = (accounts ?? []).filter((sa) => !sa.revokedAt) as ServiceAccountItem[];
  const activeCount = visibleAccounts.filter((sa) => getStatus(sa) === "active").length;

  if (!hasPro) {
    return (
      <>
        <div className="border-2 border-border bg-card p-4 sm:p-5">
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-foreground/60">Service Accounts</h3>
            <div className="py-6 text-center">
              <Bot className="h-5 w-5 text-foreground/20 mx-auto mb-2" aria-hidden="true" />
              <p className="text-sm text-foreground/50">No service accounts yet</p>
              <p className="text-xs text-foreground/40 mt-1">
                Upgrade to Pro for passwordless CI/CD integration
              </p>
              <button
                type="button"
                onClick={() => setShowUpgradeDialog(true)}
                className="mt-3 px-4 py-1.5 text-xs font-medium border border-border hover:border-foreground hover:bg-muted/50 transition-all text-foreground"
              >
                Upgrade
              </button>
            </div>
          </div>
        </div>
        <UpgradeToProDialog open={showUpgradeDialog} onClose={() => setShowUpgradeDialog(false)} />
      </>
    );
  }

  if (isLoading) {
    return (
      <div className="border-2 border-border bg-card p-5">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-muted rounded w-1/3" />
          <div className="space-y-2">
            <div className="h-12 bg-muted rounded w-full" />
            <div className="h-12 bg-muted rounded w-full" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="border-2 border-border bg-card p-4 sm:p-5">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-medium text-foreground/60">Service Accounts</h3>
            <div className="relative group">
              <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-foreground/40 cursor-default">
                <Terminal className="h-3 w-3" aria-hidden="true" />
                <span>Create via CLI</span>
              </div>
              <div className="absolute right-0 top-full mt-1 hidden group-hover:block z-10">
                <div className="bg-foreground text-background text-xs font-mono px-3 py-2 whitespace-nowrap">
                  relic service-account create --name &quot;my-sa&quot;
                </div>
              </div>
            </div>
          </div>

          {visibleAccounts.length === 0 ? (
            <div className="py-6 text-center">
              <Bot className="h-5 w-5 text-foreground/20 mx-auto mb-2" aria-hidden="true" />
              <p className="text-sm text-foreground/50">No service accounts</p>
              <p className="text-xs text-foreground/40 mt-1">
                Create one with <span className="font-mono">relic service-account create</span>
              </p>
            </div>
          ) : (
            <div className="space-y-0 divide-y divide-border/50">
              {visibleAccounts.map((sa) => {
                const status = getStatus(sa);
                const statusColor = getStatusColor(status);
                const isActive = status === "active";

                return (
                  <div key={sa.id} className="py-2.5 first:pt-0 last:pb-0 sm:py-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground truncate">
                            {sa.name}
                          </span>
                          <span className={`text-xs ${statusColor}`}>{status}</span>
                          {sa.oidcIssuer && (
                            <Badge className="bg-purple-500/10 text-purple-600 dark:text-purple-400 border-transparent text-[10px] px-1.5 py-0">
                              <Shield className="h-2.5 w-2.5 mr-0.5 inline" aria-hidden="true" />
                              OIDC
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <span className="font-mono text-xs text-foreground/40">
                            {sa.tokenPrefix}...
                          </span>
                          {sa.oidcIssuer && (
                            <>
                              <span className="text-foreground/20">·</span>
                              <span className="text-xs text-foreground/40 truncate max-w-[200px]">
                                {sa.oidcIssuer}
                              </span>
                            </>
                          )}
                          <span className="text-foreground/20">·</span>
                          <span className="text-xs text-foreground/40">
                            {formatTimeAgo(sa.createdAt)}
                          </span>
                          {sa.lastUsedAt && (
                            <>
                              <span className="text-foreground/20">·</span>
                              <span className="text-xs text-foreground/40">
                                used {formatTimeAgo(sa.lastUsedAt)}
                              </span>
                            </>
                          )}
                          {sa.expiresAt && status !== "expired" && (
                            <>
                              <span className="text-foreground/20">·</span>
                              <span className="text-xs text-foreground/40">
                                expires {new Date(sa.expiresAt).toLocaleDateString()}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      {isActive && isOwner && (
                        <div className="flex gap-2 self-start shrink-0 sm:self-auto">
                          <button
                            type="button"
                            onClick={() => setSaToConfigOidc(sa)}
                            className="px-3 py-1.5 text-xs font-medium border border-border text-foreground/60 hover:border-purple-600 hover:text-purple-600 dark:hover:border-purple-400 dark:hover:text-purple-400 transition-all"
                          >
                            {sa.oidcIssuer ? "Edit OIDC" : "Add OIDC"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setSaToRevoke(sa)}
                            className="px-3 py-1.5 text-xs font-medium border border-border text-foreground/60 hover:border-red-600 hover:text-red-600 dark:hover:border-red-400 dark:hover:text-red-400 transition-all"
                          >
                            Revoke
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {visibleAccounts.length > 0 && (
            <p className="text-xs text-foreground/40 tabular-nums">{activeCount}/5 active</p>
          )}
        </div>
      </div>

      {saToRevoke && (
        <RevokeServiceAccountDialog
          open={!!saToRevoke}
          onClose={() => setSaToRevoke(null)}
          serviceAccountId={saToRevoke.id}
          serviceAccountName={saToRevoke.name}
        />
      )}

      {saToConfigOidc && (
        <OidcPolicyDialog
          open={!!saToConfigOidc}
          onClose={() => setSaToConfigOidc(null)}
          serviceAccountId={saToConfigOidc.id}
          serviceAccountName={saToConfigOidc.name}
          currentIssuer={saToConfigOidc.oidcIssuer}
          currentSubjectPattern={saToConfigOidc.oidcSubjectPattern}
          currentAudience={saToConfigOidc.oidcAudience}
        />
      )}
    </>
  );
}
