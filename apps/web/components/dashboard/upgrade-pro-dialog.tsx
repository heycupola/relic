"use client";

import { api } from "@repo/backend";
import { useAction } from "convex/react";
import { Check, Lock, X } from "lucide-react";
import { useState } from "react";
import { Dialog } from "@/components/dialog";

interface UpgradeToProDialogProps {
  open: boolean;
  onClose: () => void;
}

export function UpgradeToProDialog({ open, onClose }: UpgradeToProDialogProps) {
  const getProPlan = useAction(api.user.getProPlan);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleUpgrade = async () => {
    if (isLoading) return;
    setIsLoading(true);
    setError("");

    try {
      const result = await getProPlan({});
      if (result.checkoutLink) {
        window.location.href = result.checkoutLink;
      } else {
        setError("Could not generate checkout link. Please try again.");
        setIsLoading(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start checkout");
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setError("");
    setIsLoading(false);
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose}>
      <div className="flex items-center justify-between p-3 border-b-2 border-border sm:p-4">
        <h2 className="text-sm font-semibold text-foreground">Pro Plan Required</h2>
        <button
          type="button"
          onClick={handleClose}
          className="text-foreground/40 hover:text-foreground transition-colors"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="p-3 space-y-4 sm:p-4">
        <div className="flex flex-col items-center py-4 space-y-4">
          <div className="p-3 border-2 border-border bg-muted/30">
            <Lock className="h-6 w-6 text-foreground/40" strokeWidth={1.5} aria-hidden="true" />
          </div>
          <p className="text-sm font-medium text-foreground">Upgrade to Pro to unlock</p>
          <ul className="w-full space-y-2.5 border border-border bg-muted/20 p-3 text-xs">
            <li className="flex items-center gap-2">
              <Check className="h-3.5 w-3.5 text-foreground/50 shrink-0" aria-hidden="true" />
              <span className="text-foreground/70">API keys for CI/CD pipelines</span>
            </li>
            <li className="flex items-center gap-2">
              <Check className="h-3.5 w-3.5 text-foreground/50 shrink-0" aria-hidden="true" />
              <span className="text-foreground/70">Up to 5 projects</span>
            </li>
            <li className="flex items-center gap-2">
              <Check className="h-3.5 w-3.5 text-foreground/50 shrink-0" aria-hidden="true" />
              <span className="text-foreground/70">Project sharing & collaboration</span>
            </li>
            <li className="flex items-center gap-2">
              <Check className="h-3.5 w-3.5 text-foreground/50 shrink-0" aria-hidden="true" />
              <span className="text-foreground/70">Early access to new features</span>
            </li>
          </ul>
        </div>

        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      </div>

      <div className="flex flex-col-reverse gap-2 p-3 border-t-2 border-border sm:flex-row sm:items-center sm:justify-end sm:p-4">
        <button
          type="button"
          onClick={handleClose}
          className="px-4 py-2 text-sm text-foreground/60 hover:text-foreground transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleUpgrade}
          disabled={isLoading}
          className="px-4 py-2 text-sm font-medium border-2 border-foreground bg-foreground text-background hover:bg-foreground/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? "Redirecting…" : "Upgrade to Pro"}
        </button>
      </div>
    </Dialog>
  );
}
