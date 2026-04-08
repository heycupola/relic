"use client";

import type { Id } from "@repo/backend";
import { Badge } from "@repo/ui/components/badge";
import { KeyRound, Plus } from "lucide-react";
import { useState } from "react";
import { CreateApiKeyDialog } from "./create-api-key-dialog";
import { RevokeApiKeyDialog } from "./revoke-api-key-dialog";
import { UpgradeToProDialog } from "./upgrade-pro-dialog";

export interface ApiKeyItem {
  id: Id<"apiKey">;
  name: string;
  prefix: string;
  scopes: string[];
  projectId?: Id<"project">;
  lastUsedAt?: number;
  expiresAt?: number;
  revokedAt?: number;
  createdAt: number;
}

interface ApiKeysCardProps {
  apiKeys: ApiKeyItem[];
  projectNames?: Record<string, string>;
  isLoading?: boolean;
  hasPro: boolean;
}

const MAX_KEYS = 5;

function getKeyStatus(key: ApiKeyItem): "active" | "revoked" | "expired" {
  if (key.revokedAt) return "revoked";
  if (key.expiresAt && key.expiresAt < Date.now()) return "expired";
  return "active";
}

function getStatusColor(status: ReturnType<typeof getKeyStatus>) {
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

export function ApiKeysCard({ apiKeys, projectNames, isLoading, hasPro }: ApiKeysCardProps) {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [keyToRevoke, setKeyToRevoke] = useState<ApiKeyItem | null>(null);

  const activeKeyCount = apiKeys.filter((k) => getKeyStatus(k) === "active").length;
  const visibleKeys = [...apiKeys].filter((k) => !k.revokedAt).reverse();

  if (isLoading) {
    return (
      <div className="border-2 border-border bg-card p-5">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-muted rounded w-1/4" />
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
            <h3 className="text-sm font-medium text-foreground/60">API Keys</h3>
            <button
              type="button"
              onClick={() => (hasPro ? setShowCreateDialog(true) : setShowUpgradeDialog(true))}
              disabled={hasPro && activeKeyCount >= MAX_KEYS}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border hover:border-foreground hover:bg-muted/50 transition-all text-foreground disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-border disabled:hover:bg-transparent"
            >
              <Plus className="h-3 w-3" aria-hidden="true" />
              Create
            </button>
          </div>

          {visibleKeys.length === 0 ? (
            <div className="py-6 text-center">
              <KeyRound className="h-5 w-5 text-foreground/20 mx-auto mb-2" aria-hidden="true" />
              <p className="text-sm text-foreground/50">No API keys yet</p>
              <p className="text-xs text-foreground/40 mt-1">
                {hasPro
                  ? "Create a key for programmatic access"
                  : "Upgrade to Pro to create API keys"}
              </p>
            </div>
          ) : (
            <div className={`space-y-0 divide-y divide-border/50 ${!hasPro ? "opacity-50" : ""}`}>
              {visibleKeys.map((key) => {
                const status = getKeyStatus(key);
                const statusColor = getStatusColor(status);
                const isActive = status === "active";

                return (
                  <div key={key.id} className="py-2.5 first:pt-0 last:pb-0 sm:py-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground truncate">
                            {key.name}
                          </span>
                          <span className={`text-xs ${statusColor}`}>{status}</span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <span className="font-mono text-xs text-foreground/40">
                            {key.prefix}...
                          </span>
                          <span className="text-foreground/20">·</span>
                          {key.scopes.map((scope) => (
                            <Badge
                              key={scope}
                              className="bg-muted text-foreground/60 border-transparent text-[10px] px-1.5 py-0"
                            >
                              {scope}
                            </Badge>
                          ))}
                          {key.projectId && (
                            <Badge className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-transparent text-[10px] px-1.5 py-0">
                              {projectNames?.[key.projectId] ?? "scoped"}
                            </Badge>
                          )}
                          <span className="text-foreground/20">·</span>
                          <span className="text-xs text-foreground/40">
                            {formatTimeAgo(key.createdAt)}
                          </span>
                          {key.lastUsedAt && (
                            <>
                              <span className="text-foreground/20">·</span>
                              <span className="text-xs text-foreground/40">
                                used {formatTimeAgo(key.lastUsedAt)}
                              </span>
                            </>
                          )}
                          {key.expiresAt && status !== "expired" && (
                            <>
                              <span className="text-foreground/20">·</span>
                              <span className="text-xs text-foreground/40">
                                expires {new Date(key.expiresAt).toLocaleDateString()}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      {isActive && (
                        <button
                          type="button"
                          onClick={() => setKeyToRevoke(key)}
                          className="self-start px-3 py-1.5 text-xs font-medium border border-border text-foreground/60 hover:border-red-600 hover:text-red-600 dark:hover:border-red-400 dark:hover:text-red-400 transition-all shrink-0 sm:self-auto"
                        >
                          Revoke
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {visibleKeys.length > 0 && (
            <p className="text-xs text-foreground/40 tabular-nums">
              {activeKeyCount}/{MAX_KEYS} active keys
            </p>
          )}
        </div>
      </div>

      <CreateApiKeyDialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        activeKeyCount={activeKeyCount}
      />

      {keyToRevoke && (
        <RevokeApiKeyDialog
          open={!!keyToRevoke}
          onClose={() => setKeyToRevoke(null)}
          apiKeyId={keyToRevoke.id}
          apiKeyName={keyToRevoke.name}
        />
      )}

      <UpgradeToProDialog open={showUpgradeDialog} onClose={() => setShowUpgradeDialog(false)} />
    </>
  );
}
