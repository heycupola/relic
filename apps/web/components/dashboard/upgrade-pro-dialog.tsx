"use client";

import { api } from "@repo/backend";
import { useAction } from "convex/react";
import { Check } from "lucide-react";
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
      <div className="p-5 space-y-4">
        <div className="space-y-2">
          <h3 className="text-base font-semibold text-foreground">Pro Plan Required</h3>
          <p className="text-sm text-foreground/70 leading-relaxed">
            Upgrade to Pro to unlock CI/CD integration and more.
          </p>
        </div>

        <div className="space-y-3">
          <ul className="space-y-2.5 border border-border bg-muted/20 p-3 text-xs">
            <li className="flex items-center gap-2">
              <Check className="h-3.5 w-3.5 text-foreground/50 shrink-0" aria-hidden="true" />
              <span className="text-foreground/70">Service accounts & OIDC for CI/CD</span>
            </li>
            <li className="flex items-center gap-2">
              <Check className="h-3.5 w-3.5 text-foreground/50 shrink-0" aria-hidden="true" />
              <span className="text-foreground/70">API keys for programmatic access</span>
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

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={handleClose}
            disabled={isLoading}
            className="flex-1 p-2.5 border border-border text-sm text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleUpgrade}
            disabled={isLoading}
            className="flex-1 p-2.5 border border-border bg-foreground text-background text-sm font-medium hover:bg-foreground/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "Redirecting…" : "Upgrade to Pro"}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
