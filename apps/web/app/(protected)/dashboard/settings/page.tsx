"use client";

import { api } from "@repo/backend";
import { useAction, useQuery } from "convex/react";
import { AlertTriangle, ArrowRight, ExternalLink, KeyRound, ShieldCheck } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/dashboard/page-header";
import { useBillingPortal } from "@/components/dashboard/plan-card";
import {
  CardSkeleton,
  CopyButton,
  DashboardCard,
  PlanBadge,
  StatusLabel,
  tone,
} from "@/components/dashboard/primitives";
import { Dialog } from "@/components/dialog";
import { useProCheckout } from "@/hooks/useProCheckout";
import { authClient } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { ADD_ONS, PRO_PRICE_LABEL } from "@/lib/plans";
import { SITE_DOCS_URL } from "@/lib/site";
import { trackWebEvent } from "@/lib/posthog";
import { dangerButton, focusRing, primaryButton, secondaryButton } from "@/lib/styles";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-3 sm:gap-4">
      <dt className="text-xs text-muted-foreground sm:pt-0.5">{label}</dt>
      <dd className="min-w-0 text-sm text-foreground sm:col-span-2">{children}</dd>
    </div>
  );
}

export default function SettingsPage() {
  useEffect(() => {
    trackWebEvent("web_page_viewed", { page: "settings" });
  }, []);

  const { data: session } = authClient.useSession();
  const userData = useQuery(api.user.getCurrentUser, session?.user ? {} : "skip");
  const deleteAccountAction = useAction(api.user.deleteAccount);
  const portal = useBillingPortal();
  const checkout = useProCheckout();

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const email = userData?.email || "";

  const handleDeleteAccount = useCallback(async () => {
    if (deleteConfirmEmail !== email) return;
    setIsDeleting(true);
    setDeleteError("");
    try {
      await deleteAccountAction({});
      window.location.assign("/");
    } catch (error) {
      console.error("Failed to delete account:", error);
      setDeleteError("Failed to delete account. Please try again.");
      setIsDeleting(false);
    }
  }, [deleteConfirmEmail, email, deleteAccountAction]);

  const openDeleteDialog = () => {
    setShowDeleteDialog(true);
    setDeleteConfirmEmail("");
    setDeleteError("");
  };

  const closeDeleteDialog = () => {
    setShowDeleteDialog(false);
    setDeleteConfirmEmail("");
    setDeleteError("");
  };

  const hasKeys = !!userData?.publicKey;
  const keysDate = userData?.keysUpdatedAt ?? userData?.createdAt;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8 sm:space-y-8 sm:px-6 sm:py-10 lg:px-12">
      <PageHeader
        eyebrow="~/dashboard/settings"
        title="Settings"
        description="Your account, plan, and encryption keys."
      />

      {userData === undefined ? (
        <div className="space-y-5">
          <CardSkeleton label="account" rows={3} />
          <CardSkeleton label="plan" rows={1} />
        </div>
      ) : (
        <div className="space-y-4 sm:space-y-5">
          <DashboardCard eyebrow="profile" title="Account">
            <dl className="divide-y divide-border">
              <Field label="Name">{userData.name || "—"}</Field>
              <Field label="Email">
                <span className="flex items-center gap-2">
                  <span className="break-all font-mono text-sm">{email}</span>
                  {userData.emailVerified && <StatusLabel status="verified" toneName="success" />}
                </span>
              </Field>
              <Field label="Member since">{formatDate(userData.createdAt)}</Field>
              <Field label="User ID">
                <span className="flex items-center gap-2">
                  <code className="truncate font-mono text-xs text-foreground/70">
                    {userData.id}
                  </code>
                  <CopyButton value={userData.id} label="Copy user ID" className="p-1" />
                </span>
              </Field>
            </dl>
          </DashboardCard>

          <DashboardCard
            eyebrow="billing"
            title={
              <span className="flex items-center gap-2">
                Plan
                <PlanBadge hasPro={userData.hasPro} />
              </span>
            }
            description={
              userData.hasPro
                ? `You're on Pro at ${PRO_PRICE_LABEL}. Invoices, payment method, and cancellation live in the billing portal.`
                : "You're on the Free plan. Upgrade for collaboration, more projects, and CI/CD."
            }
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground tabular-nums">
                Add-ons: {ADD_ONS.join(" · ")}
              </p>
              {userData.hasPro ? (
                <button
                  type="button"
                  onClick={() => void portal.open()}
                  disabled={portal.isPending}
                  aria-busy={portal.isPending}
                  className={`flex items-center justify-center gap-2 px-4 py-2 text-sm ${secondaryButton}`}
                >
                  {portal.isPending ? "Opening…" : "Open billing portal"}
                  <ExternalLink className="size-3.5" aria-hidden="true" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void checkout.startCheckout()}
                  disabled={checkout.isPending}
                  aria-busy={checkout.isPending}
                  className={`flex items-center justify-center gap-2 px-4 py-2 text-sm tabular-nums ${primaryButton}`}
                >
                  {checkout.isPending ? "Redirecting…" : `Upgrade · ${PRO_PRICE_LABEL}`}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </button>
              )}
            </div>
            {(portal.error || checkout.error) && (
              <p role="alert" className={`mt-3 text-xs ${tone.danger}`}>
                {portal.error ?? checkout.error}
              </p>
            )}
          </DashboardCard>

          <DashboardCard
            eyebrow="security"
            title="Encryption"
            description="Secrets are encrypted on your device before they reach Relic. We can't read them."
          >
            <div className="space-y-4">
              <div className="flex items-start gap-3 border border-border bg-muted/20 p-3">
                {hasKeys ? (
                  <ShieldCheck
                    className={`mt-0.5 size-4 shrink-0 ${tone.success}`}
                    aria-hidden="true"
                  />
                ) : (
                  <KeyRound
                    className={`mt-0.5 size-4 shrink-0 ${tone.warning}`}
                    aria-hidden="true"
                  />
                )}
                <div className="space-y-0.5 text-sm">
                  <p className="font-medium text-foreground">
                    {hasKeys ? "Encryption keys are set up" : "Encryption keys not created yet"}
                  </p>
                  <p className="text-xs text-muted-foreground text-pretty">
                    {hasKeys
                      ? `Your private key is protected by your password${keysDate ? `, last updated ${formatDate(keysDate)}` : ""}. Relic never sees the password.`
                      : "Your keys are generated when you set a password in the CLI. You'll need them before creating projects."}
                  </p>
                </div>
              </div>
              <p className="text-xs leading-relaxed text-foreground/70 text-pretty">
                {hasKeys ? (
                  <>
                    To change your password, run{" "}
                    <code className="font-mono text-foreground">relic</code> and press{" "}
                    <kbd className="border border-border bg-muted/40 px-1.5 py-px font-mono text-[11px] text-foreground">
                      p
                    </kbd>
                    . Your keys are re-encrypted on your device.
                  </>
                ) : (
                  <>
                    Run <code className="font-mono text-foreground">relic</code> in your terminal
                    and you'll be asked to choose a password.{" "}
                    <a
                      href={SITE_DOCS_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`inline-flex items-center gap-1 text-foreground underline decoration-border underline-offset-2 transition-colors hover:decoration-foreground ${focusRing}`}
                    >
                      Install the CLI
                      <ExternalLink className="size-3" aria-hidden="true" />
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  </>
                )}
              </p>
            </div>
          </DashboardCard>

          <section
            aria-labelledby="danger-zone-heading"
            className="border-2 border-red-500/30 bg-card"
          >
            <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
              <div className="space-y-1">
                <p className={`font-mono text-[11px] ${tone.danger}`}>danger zone</p>
                <h2
                  id="danger-zone-heading"
                  className="font-[family-name:var(--font-heading)] text-base font-semibold text-foreground"
                >
                  Delete account
                </h2>
                <p className="text-sm text-foreground/60 text-pretty">
                  Permanently delete your account, projects, secrets, shares, and keys. This can't
                  be undone.
                </p>
              </div>
              <button
                type="button"
                onClick={openDeleteDialog}
                className={`flex shrink-0 items-center justify-center gap-2 border-2 border-red-600/40 px-4 py-2 text-sm text-red-700 transition-colors hover:border-red-600/60 hover:bg-red-500/10 dark:text-red-400 ${focusRing}`}
              >
                <AlertTriangle className="size-4" aria-hidden="true" />
                Delete account
              </button>
            </div>
          </section>
        </div>
      )}

      <Dialog open={showDeleteDialog} onClose={closeDeleteDialog} closeOnBackdrop={!isDeleting}>
        <div className="space-y-4 p-5">
          <div className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">Delete account</h2>
            <p className="text-sm leading-relaxed text-foreground/70">
              This action is permanent and cannot be undone. All your projects, secrets,
              collaborator shares, and API keys will be permanently deleted.
            </p>
          </div>

          <div className="space-y-2">
            <label htmlFor="delete-confirm-email" className="text-sm text-foreground/70">
              Type <span className="font-mono font-medium text-foreground">{email}</span> to confirm
            </label>
            <input
              id="delete-confirm-email"
              type="email"
              value={deleteConfirmEmail}
              onChange={(e) => setDeleteConfirmEmail(e.target.value)}
              placeholder={email}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={deleteConfirmEmail.length > 0 && deleteConfirmEmail !== email}
              className="w-full border border-border bg-background p-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:border-foreground focus-visible:outline-none"
            />
          </div>

          {deleteError && (
            <p role="alert" className={`text-sm ${tone.danger}`}>
              {deleteError}
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={closeDeleteDialog}
              disabled={isDeleting}
              className={`flex-1 p-2.5 text-sm ${secondaryButton}`}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDeleteAccount}
              disabled={deleteConfirmEmail !== email || isDeleting}
              aria-busy={isDeleting}
              className={`flex-1 p-2.5 text-sm ${dangerButton}`}
            >
              {isDeleting ? "Deleting…" : "Delete my account"}
            </button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
