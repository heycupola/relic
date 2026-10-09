"use client";

import { api } from "@repo/backend";
import { Badge } from "@repo/ui/components/badge";
import { useAction } from "convex/react";
import { Check, ExternalLink, Settings } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useProCheckout } from "@/hooks/useProCheckout";
import { ADD_ONS, PRO_FEATURES, PRO_PRICE_LABEL } from "@/lib/plans";
import { focusRing, primaryButton } from "@/lib/styles";

interface UserInfoCardProps {
  name: string;
  email: string;
  hasPro: boolean;
  isLoading?: boolean;
}

const rowLinkClass = `flex items-center justify-between gap-2 w-full p-3 border border-border hover:border-foreground hover:bg-muted/50 transition-colors group disabled:opacity-50 disabled:cursor-not-allowed ${focusRing}`;

export function UserInfoCard({ name, email, hasPro, isLoading }: UserInfoCardProps) {
  const getBillingPortal = useAction(api.user.getBillingPortalUrl);
  const checkout = useProCheckout();
  const [isLoadingPortal, setIsLoadingPortal] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);

  const handleBillingPortal = async () => {
    setIsLoadingPortal(true);
    setPortalError(null);
    try {
      const result = await getBillingPortal({});
      if (!result.url) throw new Error("Billing portal is unavailable right now");
      window.location.assign(result.url);
    } catch (error) {
      setPortalError(error instanceof Error ? error.message : "Could not open the billing portal");
      setIsLoadingPortal(false);
    }
  };

  if (isLoading) {
    return (
      <div className="border-2 border-border bg-card p-4 sm:p-5" aria-busy="true">
        <span className="sr-only">Loading account…</span>
        <div className="animate-pulse motion-reduce:animate-none space-y-3" aria-hidden="true">
          <div className="h-4 bg-muted rounded w-1/2" />
          <div className="h-3 bg-muted rounded w-3/4" />
        </div>
      </div>
    );
  }

  return (
    <section aria-labelledby="account-heading" className="border-2 border-border bg-card">
      <div className="p-4 space-y-3 sm:p-5">
        <h2 id="account-heading" className="text-sm font-medium text-foreground/60">
          Account
        </h2>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <span className="text-base font-semibold text-foreground sm:text-lg truncate">
              {name}
            </span>
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
          <p className="font-mono text-sm text-foreground/60 break-all">{email}</p>
        </div>
        <Link href="/dashboard/settings" className={rowLinkClass}>
          <span className="text-sm text-foreground">Account settings</span>
          <Settings
            className="h-4 w-4 text-foreground/40 group-hover:text-foreground transition-colors"
            aria-hidden="true"
          />
        </Link>
      </div>

      <div className="border-t-2 border-border" />

      {hasPro ? (
        <div className="p-4 space-y-3 sm:p-5">
          <h3 className="text-sm font-medium text-foreground/60">Subscription</h3>
          <button
            type="button"
            onClick={handleBillingPortal}
            disabled={isLoadingPortal}
            aria-busy={isLoadingPortal}
            className={rowLinkClass}
          >
            <span className="text-sm text-foreground">
              {isLoadingPortal ? "Opening billing portal…" : "Manage subscription"}
            </span>
            <ExternalLink
              className="h-4 w-4 text-foreground/40 group-hover:text-foreground transition-colors"
              aria-hidden="true"
            />
          </button>
          {portalError && (
            <p role="alert" className="text-xs text-red-700 dark:text-red-400">
              {portalError}
            </p>
          )}
        </div>
      ) : (
        <div className="p-4 space-y-4 bg-muted/20 sm:p-5">
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Upgrade to Pro</h3>
            <ul className="space-y-2 text-sm">
              {PRO_FEATURES.map((feature) => (
                <li key={feature.id} className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-electric-ink shrink-0 mt-0.5" aria-hidden="true" />
                  <span className="text-foreground">
                    <strong>{feature.highlight}</strong>
                    {feature.rest}
                  </span>
                </li>
              ))}
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 text-electric-ink shrink-0 mt-0.5" aria-hidden="true" />
                <span className="text-foreground">Everything in Free</span>
              </li>
            </ul>

            <div className="pt-2 space-y-1.5">
              <p className="text-xs font-medium text-foreground/60">Need more?</p>
              <ul className="text-xs text-foreground/60 space-y-0.5 tabular-nums list-disc list-inside">
                {ADD_ONS.map((addOn) => (
                  <li key={addOn}>{addOn}</li>
                ))}
              </ul>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void checkout.startCheckout()}
            disabled={checkout.isPending}
            aria-busy={checkout.isPending}
            className={`block w-full text-center p-3 tabular-nums ${primaryButton}`}
          >
            {checkout.isPending
              ? "Redirecting to checkout…"
              : `Upgrade to Pro · ${PRO_PRICE_LABEL}`}
          </button>
          {checkout.error && (
            <p role="alert" className="text-xs text-red-700 dark:text-red-400">
              {checkout.error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
