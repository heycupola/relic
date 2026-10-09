"use client";

import { Check } from "lucide-react";
import { useId } from "react";
import { Dialog } from "@/components/dialog";
import { useProCheckout } from "@/hooks/useProCheckout";
import { ADD_ONS, PRO_FEATURES, PRO_PRICE_LABEL, planFeatureText } from "@/lib/plans";
import { primaryButton, secondaryButton } from "@/lib/styles";

interface UpgradeToProDialogProps {
  open: boolean;
  onClose: () => void;
}

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
    <Dialog open={open} onClose={handleClose} labelledBy={titleId} closeOnBackdrop={!isPending}>
      <div className="p-5 space-y-4">
        <div className="space-y-2">
          <h2 id={titleId} className="text-base font-semibold text-foreground text-balance">
            Pro plan required
          </h2>
          <p className="text-sm text-foreground/70 leading-relaxed text-pretty">
            Upgrade to Pro to unlock CI/CD integration and more.
          </p>
        </div>

        <div className="space-y-2.5 border border-border bg-muted/20 p-3 text-xs">
          <ul className="space-y-2.5">
            {PRO_FEATURES.map((feature) => (
              <li key={feature.id} className="flex items-center gap-2">
                <Check className="h-3.5 w-3.5 text-electric-ink shrink-0" aria-hidden="true" />
                <span className="text-foreground/80">{planFeatureText(feature)}</span>
              </li>
            ))}
          </ul>
          <p className="border-t border-border pt-2.5 text-foreground/60 tabular-nums">
            Need more? {ADD_ONS.join(" · ")}
          </p>
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            {error}
          </p>
        )}

        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={handleClose}
            disabled={isPending}
            className={`flex-1 p-2.5 text-sm ${secondaryButton}`}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleUpgrade}
            disabled={isPending}
            aria-busy={isPending}
            className={`flex-1 p-2.5 text-sm tabular-nums ${primaryButton}`}
          >
            {isPending ? "Redirecting…" : `Upgrade to Pro · ${PRO_PRICE_LABEL}`}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
