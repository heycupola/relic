"use client";

import { api } from "@repo/backend";
import { useAction, useQuery } from "convex/react";
import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ContainerLines } from "@/components/container-lines";
import { Dialog } from "@/components/dialog";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { authClient } from "@/lib/auth";
import { trackWebEvent } from "@/lib/posthog";

export default function SettingsPage() {
  useEffect(() => {
    trackWebEvent("web_page_viewed", { page: "settings" });
  }, []);

  const router = useRouter();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const userData = useQuery(api.user.getCurrentUser, session?.user ? {} : "skip");
  const deleteAccountAction = useAction(api.user.deleteAccount);

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
  };

  const closeDeleteDialog = () => {
    setShowDeleteDialog(false);
    setDeleteConfirmEmail("");
    setDeleteError("");
  };

  useEffect(() => {
    if (sessionPending) return;
    if (!session?.user) {
      router.replace("/login?returnUrl=/dashboard/settings");
    }
  }, [session, sessionPending, router]);

  if (sessionPending || !session?.user) {
    return null;
  }

  const isLoading = userData === undefined;

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <ContainerLines />
      <div className="flex flex-col min-h-dvh">
        <Header showLogout />
        <div className="border-b border-border">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-12">
            <nav className="flex items-center gap-2 py-3 text-sm">
              <Link
                href="/dashboard"
                className="text-foreground/50 hover:text-foreground transition-colors"
              >
                Dashboard
              </Link>
              <span className="text-foreground/25">/</span>
              <span className="text-foreground font-medium">Settings</span>
            </nav>
          </div>
        </div>
        <main className="mx-auto max-w-6xl px-4 py-6 flex-1 w-full sm:px-6 sm:py-8 lg:px-12">
          <div className="space-y-6">
            {isLoading ? (
              <div className="border-2 border-border bg-card p-5">
                <div className="animate-pulse space-y-3">
                  <div className="h-4 bg-muted rounded w-1/3" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                </div>
              </div>
            ) : (
              <>
                <div className="border-2 border-border bg-card p-4 sm:p-5 space-y-3">
                  <h2 className="text-sm font-medium text-foreground/60">Account</h2>
                  <div className="space-y-1.5">
                    <p className="text-base font-semibold text-foreground sm:text-lg">
                      {userData?.name}
                    </p>
                    <p className="font-mono text-sm text-foreground/60">{email}</p>
                  </div>
                </div>

                <div className="border-2 border-red-500/20 bg-card">
                  <div className="p-4 sm:p-5 space-y-4">
                    <div className="space-y-1">
                      <h2 className="text-sm font-medium text-red-600 dark:text-red-400">
                        Danger zone
                      </h2>
                      <p className="text-sm text-foreground/60 leading-relaxed">
                        Permanently delete your account and all associated data. This action cannot
                        be undone.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={openDeleteDialog}
                      className="flex items-center gap-2 p-3 border border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-500/10 hover:border-red-500/50 transition-all text-sm"
                    >
                      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                      Delete account
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          <Dialog open={showDeleteDialog} onClose={closeDeleteDialog}>
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

              {deleteError && (
                <p className="text-sm text-red-600 dark:text-red-400">{deleteError}</p>
              )}

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
          </Dialog>
        </main>
        <Footer />
      </div>
    </div>
  );
}
