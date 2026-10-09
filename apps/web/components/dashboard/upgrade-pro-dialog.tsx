"use client";

import { Check } from "lucide-react";
import { useId } from "react";
import { Dialog } from "@/components/dialog";
import { useProCheckout } from "@/hooks/useProCheckout";

interface UpgradeToProDialogProps {
  open: boolean;
  onClose: () => void;
}

const PRO_FEATURES = [
  "Service accounts & OIDC for CI/CD",
  "API keys for programmatic access",
  "5 projects included, $2/month for each extra",
  "Project sharing, 5 collaborators per project included",
  "Early access to new features",
];

export function UpgradeToProDialog({ open, onClose }: UpgradeToProDialogProps) {
  const { startCheckout, isPending, error, clearError } = useProCheckout();
  const titleId = useId();

  const handleClose = () => {
    if (isPending) return;
    clearError();
    onClose();
  };

  const handleUpgrade = async () => {
    if ((await startCheckout()) === "already_pro") onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} labelledBy={titleId}>
      <div className="p-5 space-y-4">
        <div className="space-y-2">
          <h3 id={titleId} className="text-base font-semibold text-foreground text-balance">
            Pro plan required
          </h3>
          <p className="text-sm text-foreground/70 leading-relaxed text-pretty">
            Upgrade to Pro to unlock CI/CD integration and more.
          </p>
        </div>

        <ul className="space-y-2.5 border border-border bg-muted/20 p-3 text-xs">
          {PRO_FEATURES.map((feature) => (
            <li key={feature} className="flex items-center gap-2">
              <Check className="h-3.5 w-3.5 text-foreground/50 shrink-0" aria-hidden="true" />
              <span className="text-foreground/70">{feature}</span>
            </li>
          ))}
        </ul>

        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={handleClose}
            disabled={isPending}
            className="flex-1 p-2.5 border border-border text-sm text-foreground hover:bg-muted/50 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleUpgrade}
            disabled={isPending}
            aria-busy={isPending}
            className="flex-1 p-2.5 border border-border bg-foreground text-background text-sm font-medium hover:bg-foreground/90 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground disabled:opacity-50 disabled:cursor-not-allowed tabular-nums"
          >
            {isPending ? "Redirecting…" : "Upgrade to Pro · $9/month"}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
