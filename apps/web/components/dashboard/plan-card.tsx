"use client";

import { api } from "@repo/backend";
import { useAction } from "convex/react";
import { ArrowRight, Check, ExternalLink } from "lucide-react";
import { useCallback, useState } from "react";
import { trackWebEvent } from "@/lib/posthog";
import { primaryButton, secondaryButton } from "@/lib/styles";
import { ADD_ONS, MAX_API_KEYS, PRO_FEATURES, PRO_PRICE_LABEL } from "./plan-copy";
import { DashboardCard, Meter, PlanBadge, tone } from "./primitives";

interface PlanCardProps {
  hasPro: boolean;
  projectsUsed: number;
  projectsIncluded: number;
  activeApiKeys: number;
}

type CheckoutResult = "redirecting" | "already_pro" | "error";

/** Starts Pro checkout and redirects to Autumn, or reports that the user is already on Pro. */
export function useProCheckout() {
  const getProPlan = useAction(api.user.getProPlan);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startCheckout = useCallback(async (): Promise<CheckoutResult> => {
    setIsPending(true);
    setError(null);
    trackWebEvent("web_upgrade_started");

    try {
      const result = await getProPlan({});
      if (result.hasPro) {
        setIsPending(false);
        return "already_pro";
      }
      if (result.checkoutLink) {
        window.location.assign(result.checkoutLink);
        return "redirecting";
      }
      throw new Error("Could not create a checkout link. Please try again.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start checkout");
      setIsPending(false);
      return "error";
    }
  }, [getProPlan]);

  return { startCheckout, isPending, error };
}

export function useBillingPortal() {
  const getBillingPortal = useAction(api.user.getBillingPortalUrl);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = async () => {
    setIsPending(true);
    setError(null);
    try {
      const result = await getBillingPortal({});
      if (!result.url) throw new Error("Billing portal is unavailable right now");
      window.location.assign(result.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open the billing portal");
      setIsPending(false);
    }
  };

  return { open, isPending, error };
}

export function PlanCard({ hasPro, projectsUsed, projectsIncluded, activeApiKeys }: PlanCardProps) {
  const portal = useBillingPortal();
  const checkout = useProCheckout();

  return (
    <DashboardCard
      eyebrow="plan"
      title={
        <span className="flex items-center gap-2">
          {hasPro ? "Relic Pro" : "Relic Free"}
          <PlanBadge hasPro={hasPro} />
        </span>
      }
      description={hasPro ? PRO_PRICE_LABEL : "Personal secrets, fully encrypted."}
    >
      <div className="space-y-4">
        <div className="space-y-3">
          <Meter label="Projects" used={projectsUsed} limit={projectsIncluded} />
          {hasPro ? <Meter label="API keys" used={activeApiKeys} limit={MAX_API_KEYS} /> : null}
        </div>

        {hasPro ? (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => void portal.open()}
              disabled={portal.isPending}
              aria-busy={portal.isPending}
              className={`flex w-full items-center justify-between gap-2 px-3 py-2.5 text-sm ${secondaryButton}`}
            >
              {portal.isPending ? "Opening billing portal…" : "Manage billing"}
              <ExternalLink className="size-3.5 text-muted-foreground" aria-hidden="true" />
            </button>
            <p className="text-xs text-muted-foreground tabular-nums">
              Add-ons: {ADD_ONS.join(" · ")}
            </p>
            {portal.error && (
              <p role="alert" className={`text-xs ${tone.danger}`}>
                {portal.error}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3 border-t border-border pt-4">
            <p className="text-xs font-medium text-foreground">Upgrade to Pro to unlock</p>
            <ul className="space-y-1.5 text-xs">
              {PRO_FEATURES.map((feature) => (
                <li key={feature.id} className="flex items-start gap-2">
                  <Check className="mt-px size-3.5 shrink-0 text-electric-ink" aria-hidden="true" />
                  <span className="text-foreground/80">
                    <strong className="font-medium text-foreground">{feature.highlight}</strong>
                    {feature.rest}
                  </span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => void checkout.startCheckout()}
              disabled={checkout.isPending}
              aria-busy={checkout.isPending}
              className={`group flex w-full items-center justify-center gap-2 px-3 py-2.5 text-sm tabular-nums ${primaryButton}`}
            >
              {checkout.isPending ? "Redirecting to checkout…" : `Upgrade · ${PRO_PRICE_LABEL}`}
              {!checkout.isPending && (
                <ArrowRight
                  className="size-4 transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              )}
            </button>
            {checkout.error && (
              <p role="alert" className={`text-xs ${tone.danger}`}>
                {checkout.error}
              </p>
            )}
          </div>
        )}
      </div>
    </DashboardCard>
  );
}
