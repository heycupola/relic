"use client";

import type { Id } from "@repo/backend";
import { api } from "@repo/backend";
import { cn } from "@repo/ui/lib/utils";
import { useQuery } from "convex/react";
import { Bot, ExternalLink, FolderKanban, Lock, Plus, Shield, X } from "lucide-react";
import { useId, useState } from "react";
import { Select } from "@/components/select";
import { formatDate, formatTimeAgo } from "@/lib/format";
import { SITE_DOCS_URL } from "@/lib/site";
import { focusRing, primaryButton, rowActionButton, rowDangerButton } from "@/lib/styles";
import { OidcPolicyDialog } from "./oidc-policy-dialog";
import { CommandLine, DashboardCard, EmptyState, StatusLabel } from "./primitives";
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
  /** Active projects the user owns; service accounts belong to exactly one of them. */
  projects: { id: string; name: string }[];
  hasPro: boolean;
}

function issuerLabel(issuer: string) {
  if (issuer.includes("token.actions.githubusercontent.com")) return "GitHub Actions";
  if (issuer.includes("gitlab")) return "GitLab CI";
  try {
    return new URL(issuer).host;
  } catch {
    return issuer;
  }
}

export function ServiceAccountsCard({ projects, hasPro }: ServiceAccountsCardProps) {
  const selectId = useId();
  const [selectedId, setSelectedId] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [saToRevoke, setSaToRevoke] = useState<ServiceAccountItem | null>(null);
  const [saToConfigOidc, setSaToConfigOidc] = useState<ServiceAccountItem | null>(null);

  const project = projects.find((p) => p.id === selectedId) ?? projects[0];
  const accounts = useQuery(
    api.serviceAccount.listServiceAccounts,
    hasPro && project ? { projectId: project.id as Id<"project"> } : "skip",
  );

  const visibleAccounts = ((accounts ?? []) as ServiceAccountItem[])
    .filter((sa) => !sa.revokedAt)
    .sort((a, b) => b.createdAt - a.createdAt);

  const canCreate = hasPro && !!project;

  return (
    <>
      <DashboardCard
        eyebrow="service accounts"
        title="Service accounts"
        description="Passwordless access for CI/CD pipelines, optionally locked to an OIDC identity."
        action={
          <button
            type="button"
            onClick={() => (canCreate ? setShowCreate((v) => !v) : setShowUpgradeDialog(true))}
            disabled={hasPro && !project}
            aria-expanded={canCreate ? showCreate : undefined}
            className={rowActionButton}
          >
            {!hasPro ? (
              <Lock className="size-3" aria-hidden="true" />
            ) : showCreate ? (
              <X className="size-3" aria-hidden="true" />
            ) : (
              <Plus className="size-3" aria-hidden="true" />
            )}
            {showCreate ? "Close" : "New"}
          </button>
        }
        bodyClassName="p-0 sm:p-0"
      >
        {!hasPro ? (
          <div className="p-4 sm:p-5">
            <EmptyState
              icon={Lock}
              title="Service accounts are a Pro feature"
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
              Inject secrets into GitHub Actions, GitLab CI, and other pipelines without sharing
              your password.
            </EmptyState>
          </div>
        ) : !project ? (
          <div className="p-4 sm:p-5">
            <EmptyState icon={FolderKanban} title="Create a project first">
              Service accounts belong to a project you own. Run{" "}
              <code className="font-mono text-foreground">relic</code> to create one.
            </EmptyState>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:gap-3 sm:px-5">
              <label htmlFor={selectId} className="shrink-0 text-xs text-muted-foreground">
                Project
              </label>
              {projects.length > 1 ? (
                <Select
                  id={selectId}
                  value={project.id}
                  onChange={(value) => {
                    setSelectedId(value);
                    setShowCreate(false);
                  }}
                  options={projects.map((p) => ({ value: p.id, label: p.name }))}
                  className="sm:w-64"
                />
              ) : (
                <span id={selectId} className="text-sm font-medium text-foreground">
                  {project.name}
                </span>
              )}
            </div>

            {showCreate && (
              <div className="space-y-3 border-b border-border bg-muted/20 px-4 py-4 sm:px-5">
                <div className="space-y-0.5">
                  <h3 className="text-sm font-medium text-foreground">
                    Create a service account from the CLI
                  </h3>
                  <p className="text-xs text-muted-foreground text-pretty">
                    The token is generated and encrypted on your machine, so creation happens in the
                    terminal. It appears here once created.
                  </p>
                </div>
                <div className="space-y-2">
                  <p className="text-[11px] text-muted-foreground">Basic token</p>
                  <CommandLine
                    command={`relic service-account create --name "ci" --project ${project.id}`}
                  />
                  <p className="pt-1 text-[11px] text-muted-foreground">
                    Locked to a GitHub repo with OIDC (recommended)
                  </p>
                  <CommandLine
                    command={`relic service-account create --name "github-ci" --project ${project.id} --github my-org/my-repo`}
                  />
                </div>
                <a
                  href={`${SITE_DOCS_URL}/guides/service-accounts`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground ${focusRing}`}
                >
                  Service account guide
                  <ExternalLink className="size-3" aria-hidden="true" />
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </div>
            )}

            {accounts === undefined ? (
              <div
                className="space-y-2 p-4 animate-pulse motion-reduce:animate-none sm:p-5"
                aria-busy="true"
              >
                <span className="sr-only">Loading service accounts…</span>
                <div className="h-10 bg-muted/70" aria-hidden="true" />
                <div className="h-10 bg-muted/70" aria-hidden="true" />
              </div>
            ) : visibleAccounts.length === 0 ? (
              <div className="p-4 sm:p-5">
                <EmptyState icon={Bot} title={`No service accounts in ${project.name}`}>
                  Use <span className="font-medium text-foreground">New</span> to see the command
                  for creating one.
                </EmptyState>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {visibleAccounts.map((sa) => {
                  const expired = !!sa.expiresAt && sa.expiresAt < Date.now();
                  const meta = [
                    `created ${formatDate(sa.createdAt)}`,
                    sa.lastUsedAt ? `used ${formatTimeAgo(sa.lastUsedAt)}` : "never used",
                  ];
                  if (sa.expiresAt && !expired) meta.push(`expires ${formatDate(sa.expiresAt)}`);

                  return (
                    <li
                      key={sa.id}
                      className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-5"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="truncate text-sm font-medium text-foreground">
                            {sa.name}
                          </span>
                          <code className="font-mono text-xs text-muted-foreground">
                            {sa.tokenPrefix}…
                          </code>
                          <StatusLabel
                            status={expired ? "expired" : "active"}
                            toneName={expired ? "warning" : "success"}
                          />
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 border px-1.5 py-px font-mono text-[10px]",
                              sa.oidcIssuer
                                ? "border-electric-ink/30 bg-electric-ink/5 text-electric-ink"
                                : "border-border text-foreground/60",
                            )}
                            title={sa.oidcSubjectPattern}
                          >
                            <Shield className="size-2.5" aria-hidden="true" />
                            {sa.oidcIssuer ? `OIDC · ${issuerLabel(sa.oidcIssuer)}` : "token only"}
                          </span>
                          <span>{meta.join(" · ")}</span>
                        </div>
                      </div>
                      {!expired && (
                        <div className="flex shrink-0 gap-2 self-start sm:self-auto">
                          <button
                            type="button"
                            onClick={() => setSaToConfigOidc(sa)}
                            aria-label={`${sa.oidcIssuer ? "Edit" : "Add"} OIDC policy for ${sa.name}`}
                            className={rowActionButton}
                          >
                            {sa.oidcIssuer ? "Edit OIDC" : "Add OIDC"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setSaToRevoke(sa)}
                            aria-label={`Revoke ${sa.name}`}
                            className={rowDangerButton}
                          >
                            Revoke
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </DashboardCard>

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

      <UpgradeToProDialog open={showUpgradeDialog} onClose={() => setShowUpgradeDialog(false)} />
    </>
  );
}
