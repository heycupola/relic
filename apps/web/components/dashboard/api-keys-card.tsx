"use client";

import type { Id } from "@repo/backend";
import { cn } from "@repo/ui/lib/utils";
import { KeyRound, Lock, Plus } from "lucide-react";
import { useId, useState } from "react";
import { formatDate, formatTimeAgo } from "@/lib/format";
import { MAX_API_KEYS } from "@/lib/plans";
import { primaryButton, rowActionButton, rowDangerButton } from "@/lib/styles";
import { CreateApiKeyDialog } from "./create-api-key-dialog";
import { CardSkeleton, DashboardCard, EmptyState, StatusLabel } from "./primitives";
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

const EXPIRING_SOON_MS = 7 * 86_400_000;

function isExpired(key: ApiKeyItem) {
  return !!key.expiresAt && key.expiresAt < Date.now();
}

export function ApiKeysCard({ apiKeys, projectNames, isLoading, hasPro }: ApiKeysCardProps) {
  const limitHintId = useId();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [keyToRevoke, setKeyToRevoke] = useState<ApiKeyItem | null>(null);

  if (isLoading) return <CardSkeleton label="API keys" rows={2} />;

  const visibleKeys = apiKeys.filter((k) => !k.revokedAt).sort((a, b) => b.createdAt - a.createdAt);
  const activeKeyCount = visibleKeys.filter((k) => !isExpired(k)).length;
  const atLimit = hasPro && activeKeyCount >= MAX_API_KEYS;

  const openCreate = () => (hasPro ? setShowCreateDialog(true) : setShowUpgradeDialog(true));

  return (
    <>
      <DashboardCard
        eyebrow="api keys"
        title="API keys"
        description="Personal tokens for scripts and integrations that read secrets over the API."
        action={
          <button
            type="button"
            onClick={openCreate}
            disabled={atLimit}
            aria-describedby={atLimit ? limitHintId : undefined}
            className={rowActionButton}
          >
            {hasPro ? (
              <Plus className="size-3" aria-hidden="true" />
            ) : (
              <Lock className="size-3" aria-hidden="true" />
            )}
            New key
          </button>
        }
        footer={
          hasPro ? (
            <span id={limitHintId} className="tabular-nums">
              {activeKeyCount} of {MAX_API_KEYS} active keys
              {atLimit && " · revoke one to create another"}
            </span>
          ) : undefined
        }
        bodyClassName={visibleKeys.length > 0 ? "p-0 sm:p-0" : undefined}
      >
        {visibleKeys.length === 0 ? (
          hasPro ? (
            <EmptyState
              icon={KeyRound}
              title="No API keys yet"
              action={
                <button
                  type="button"
                  onClick={openCreate}
                  className={`px-3 py-1.5 text-xs ${primaryButton}`}
                >
                  Create your first key
                </button>
              }
            >
              Keys can be limited to one project, scoped to read-only, and set to expire.
            </EmptyState>
          ) : (
            <EmptyState
              icon={Lock}
              title="API keys are a Pro feature"
              action={
                <button
                  type="button"
                  onClick={() => setShowUpgradeDialog(true)}
                  className={`px-3 py-1.5 text-xs ${primaryButton}`}
                >
                  See Pro plan
                </button>
              }
            >
              Read secrets programmatically from your own tools and scripts.
            </EmptyState>
          )
        ) : (
          <ul className={cn("divide-y divide-border", !hasPro && "opacity-60")}>
            {visibleKeys.map((key) => {
              const expired = isExpired(key);
              const expiringSoon =
                !expired && !!key.expiresAt && key.expiresAt - Date.now() < EXPIRING_SOON_MS;
              const meta = [
                key.projectId ? (projectNames?.[key.projectId] ?? "one project") : "all projects",
                `created ${formatDate(key.createdAt)}`,
                key.lastUsedAt ? `used ${formatTimeAgo(key.lastUsedAt)}` : "never used",
              ];

              return (
                <li
                  key={key.id}
                  className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-5"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="truncate text-sm font-medium text-foreground">
                        {key.name}
                      </span>
                      <code className="font-mono text-xs text-muted-foreground">{key.prefix}…</code>
                      {expired ? (
                        <StatusLabel status="expired" toneName="warning" />
                      ) : expiringSoon ? (
                        <StatusLabel
                          status={`expires ${formatDate(key.expiresAt!)}`}
                          toneName="warning"
                        />
                      ) : (
                        <StatusLabel status="active" toneName="success" />
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {key.scopes.map((scope) => (
                        <span
                          key={scope}
                          className="border border-border bg-muted/30 px-1.5 py-px font-mono text-[10px] text-foreground/70"
                        >
                          {scope}
                        </span>
                      ))}
                      <span className="text-xs text-muted-foreground">{meta.join(" · ")}</span>
                    </div>
                  </div>
                  {!expired && (
                    <button
                      type="button"
                      onClick={() => setKeyToRevoke(key)}
                      aria-label={`Revoke ${key.name}`}
                      className={`self-start sm:self-auto ${rowDangerButton}`}
                    >
                      Revoke
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </DashboardCard>

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
