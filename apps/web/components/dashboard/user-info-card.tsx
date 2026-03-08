"use client";

import { api } from "@repo/backend";
import { Badge } from "@repo/ui/components/badge";
import { useAction } from "convex/react";
import { AlertTriangle, Check, ExternalLink } from "lucide-react";
import { useCallback, useRef, useState } from "react";

interface UserInfoCardProps {
  name: string;
  email: string;
  hasPro: boolean;
  isLoading?: boolean;
}

export function UserInfoCard({ name, email, hasPro, isLoading }: UserInfoCardProps) {
  const getBillingPortal = useAction(api.user.getBillingPortalUrl);
  const getProPlan = useAction(api.user.getProPlan);
  const deleteAccountAction = useAction(api.user.deleteAccount);
  const [isLoadingPortal, setIsLoadingPortal] = useState(false);
  const [isLoadingUpgrade, setIsLoadingUpgrade] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);

  const handleDeleteAccount = useCallback(async () => {
    if (deleteConfirmEmail !== email) return;
    setIsDeleting(true);
    setDeleteError("");
    try {
      await deleteAccountAction({});
      window.location.href = "/";
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
    setTimeout(() => dialogRef.current?.showModal(), 0);
  };

  const closeDeleteDialog = () => {
    dialogRef.current?.close();
    setShowDeleteDialog(false);
    setDeleteConfirmEmail("");
    setDeleteError("");
  };

  const handleBillingPortal = async () => {
    setIsLoadingPortal(true);
    try {
      const result = await getBillingPortal({});
      if (result.url) {
        window.location.href = result.url;
      }
    } catch (error) {
      console.error("Failed to get billing portal URL:", error);
      setIsLoadingPortal(false);
    }
  };

  const handleUpgradeToPro = async () => {
    setIsLoadingUpgrade(true);
    try {
      const result = await getProPlan({});
      if (result.checkoutLink) {
        window.location.href = result.checkoutLink;
      }
    } catch (error) {
      console.error("Failed to get checkout link:", error);
      setIsLoadingUpgrade(false);
    }
  };

  if (isLoading) {
    return (
      <div className="border-2 border-border bg-card p-5">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-muted rounded w-1/2" />
          <div className="h-3 bg-muted rounded w-3/4" />
        </div>
      </div>
    );
  }

  return (
    <div className="border-2 border-border bg-card">
      <div className="p-4 space-y-3 sm:p-5">
        <h3 className="text-sm font-medium text-foreground/60">Account</h3>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-semibold text-foreground sm:text-lg">{name}</span>
            <Badge
              className={
                hasPro
                  ? "bg-foreground text-background border-transparent font-bold"
                  : "bg-muted text-muted-foreground border-transparent"
              }
            >
              {hasPro ? "Pro" : "Free"}
            </Badge>
          </div>
          <p className="font-mono text-sm text-foreground/60">{email}</p>
        </div>
      </div>

      {hasPro ? (
        <>
          <div className="border-t-2 border-border" />
          <div className="p-4 space-y-3 sm:p-5">
            <h4 className="text-sm font-medium text-foreground/60">Subscription</h4>
            <button
              type="button"
              onClick={handleBillingPortal}
              disabled={isLoadingPortal}
              className="flex items-center justify-between gap-2 w-full p-3 border border-border hover:border-foreground hover:bg-muted/50 transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="text-sm text-foreground">
                {isLoadingPortal ? "Loading…" : "Manage subscription"}
              </span>
              <ExternalLink
                className="h-4 w-4 text-foreground/40 group-hover:text-foreground transition-colors"
                aria-hidden="true"
              />
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="border-t-2 border-border" />
          <div className="p-4 space-y-4 bg-muted/20 sm:p-5">
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-foreground">Upgrade to Pro</h4>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-electric-ink shrink-0 mt-0.5" aria-hidden="true" />
                  <span className="text-foreground">
                    <strong>Collaborate on projects</strong> - 5 free shares per project
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-electric-ink shrink-0 mt-0.5" aria-hidden="true" />
                  <span className="text-foreground">
                    <strong>5 free projects</strong> included
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-electric-ink shrink-0 mt-0.5" aria-hidden="true" />
                  <span className="text-foreground">
                    <strong>API keys</strong> for CI/CD integration
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-electric-ink shrink-0 mt-0.5" aria-hidden="true" />
                  <span className="text-foreground">Activity logs & analytics</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-electric-ink shrink-0 mt-0.5" aria-hidden="true" />
                  <span className="text-foreground">
                    <strong>Early access</strong> to new features
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-electric-ink shrink-0 mt-0.5" aria-hidden="true" />
                  <span className="text-foreground">Everything in Free</span>
                </li>
              </ul>

              <div className="pt-2 space-y-1.5">
                <p className="text-xs font-medium text-foreground/50">Need more?</p>
                <div className="text-xs text-foreground/60 space-y-0.5 tabular-nums">
                  <p>• Additional projects: $10 each</p>
                  <p>• Additional shares: $5 each</p>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleUpgradeToPro}
              disabled={isLoadingUpgrade}
              className="block w-full text-center p-3 border-2 border-border bg-foreground text-background font-medium hover:bg-foreground/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed tabular-nums"
            >
              {isLoadingUpgrade ? "Loading…" : "Upgrade to Pro - $20/month"}
            </button>
          </div>
        </>
      )}

      <div className="border-t-2 border-border" />
      <div className="p-4 space-y-3 sm:p-5">
        <h4 className="text-sm font-medium text-foreground/60">Danger zone</h4>
        <button
          type="button"
          onClick={openDeleteDialog}
          className="flex items-center gap-2 w-full p-3 border border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-500/10 hover:border-red-500/50 transition-all text-sm"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          Delete account
        </button>
      </div>

      {showDeleteDialog && (
        <dialog
          ref={dialogRef}
          onClose={closeDeleteDialog}
          className="fixed inset-0 z-50 m-auto w-full max-w-md border-2 border-border bg-card p-0 backdrop:bg-black/50"
        >
          <div className="p-5 space-y-4">
            <div className="space-y-2">
              <h3 className="text-base font-semibold text-foreground">Delete account</h3>
              <p className="text-sm text-foreground/70 leading-relaxed">
                This action is permanent and cannot be undone. All your projects, secrets,
                collaborator shares, and API keys will be permanently deleted.
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="delete-confirm-email" className="text-sm text-foreground/70">
                Type <span className="font-mono font-medium text-foreground">{email}</span> to
                confirm
              </label>
              <input
                id="delete-confirm-email"
                type="email"
                value={deleteConfirmEmail}
                onChange={(e) => setDeleteConfirmEmail(e.target.value)}
                placeholder={email}
                autoComplete="off"
                className="w-full p-2.5 border border-border bg-background text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-foreground"
              />
            </div>

            {deleteError && <p className="text-sm text-red-600 dark:text-red-400">{deleteError}</p>}

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={closeDeleteDialog}
                disabled={isDeleting}
                className="flex-1 p-2.5 border border-border text-sm text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={deleteConfirmEmail !== email || isDeleting}
                className="flex-1 p-2.5 border border-red-500/30 bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDeleting ? "Deleting…" : "Delete my account"}
              </button>
            </div>
          </div>
        </dialog>
      )}
    </div>
  );
}
