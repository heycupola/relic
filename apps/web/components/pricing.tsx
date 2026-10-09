"use client";

import { api } from "@repo/backend";
import { useConvexAuth, useQuery } from "convex/react";
import { Check, X } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useProCheckout } from "@/hooks/useProCheckout";
import {
  ADD_ONS,
  FREE_EXCLUSIONS,
  FREE_FEATURES,
  FREE_PRICE_USD,
  PRO_FEATURES,
  PRO_PRICE_USD,
} from "@/lib/plans";
import { primaryButton, secondaryButton } from "@/lib/styles";
import { SectionWrapper } from "./section-wrapper";

const UPGRADE_LOGIN_URL = `/login?returnUrl=${encodeURIComponent("/dashboard?action=upgrade")}`;

function Feature({ included = true, children }: { included?: boolean; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      {included ? (
        <Check className="h-4 w-4 text-electric-ink shrink-0 mt-0.5" aria-hidden="true" />
      ) : (
        <X className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" aria-hidden="true" />
      )}
      <span className={included ? "text-foreground" : "text-muted-foreground"}>{children}</span>
    </li>
  );
}

function Price({ amount }: { amount: number }) {
  return (
    <p className="flex items-baseline gap-1">
      <span className="text-3xl font-bold text-foreground tabular-nums sm:text-4xl">${amount}</span>
      <span className="text-foreground/60 text-sm sm:text-base">/month</span>
    </p>
  );
}

export function Pricing() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const userData = useQuery(api.user.getCurrentUser, isAuthenticated ? {} : "skip");
  const checkout = useProCheckout();

  const hasPro = userData?.hasPro ?? false;

  const handleFreeClick = () => {
    if (isLoading) return;
    router.push(isAuthenticated ? "/dashboard" : "/login?returnUrl=/dashboard");
  };

  const handleProClick = async () => {
    if (isLoading || hasPro) return;
    if (!isAuthenticated) {
      router.push(UPGRADE_LOGIN_URL);
      return;
    }
    if ((await checkout.startCheckout()) === "already_pro") router.push("/dashboard");
  };

  const proButtonText = (() => {
    if (isLoading) return "Loading…";
    if (checkout.isPending) return "Redirecting to checkout…";
    if (hasPro) return "Current plan";
    if (!isAuthenticated) return "Get started with Pro";
    return "Upgrade to Pro";
  })();

  return (
    <SectionWrapper label="Pricing" id="pricing">
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16 lg:px-12">
        <h2 className="text-xl font-semibold text-foreground sm:text-2xl">Pricing</h2>
        <p className="mt-2 text-sm text-foreground/60 text-pretty sm:text-base">
          Simple pricing. No surprises.
        </p>

        <div className="mt-8 grid grid-cols-1 gap-5 sm:mt-12 sm:gap-6 lg:grid-cols-2">
          <article
            aria-labelledby="plan-free"
            className="border-2 border-border bg-card flex flex-col"
          >
            <div className="p-4 space-y-4 flex-1 sm:p-6">
              <div className="space-y-1 sm:space-y-2">
                <h3 id="plan-free" className="text-lg font-semibold text-foreground sm:text-xl">
                  Free
                </h3>
                <Price amount={FREE_PRICE_USD} />
              </div>

              <ul className="space-y-3 text-sm">
                {FREE_FEATURES.map((feature) => (
                  <Feature key={feature}>{feature}</Feature>
                ))}
                {FREE_EXCLUSIONS.map((feature) => (
                  <Feature key={feature} included={false}>
                    {feature}
                  </Feature>
                ))}
              </ul>
            </div>

            {!hasPro && (
              <div className="border-t-2 border-border p-4 sm:p-6">
                <button
                  type="button"
                  onClick={handleFreeClick}
                  disabled={isLoading}
                  className={`block w-full text-center p-3 font-medium ${secondaryButton}`}
                >
                  {isLoading ? "Loading…" : "Get started"}
                </button>
              </div>
            )}
          </article>

          <article
            aria-labelledby="plan-pro"
            className="border-2 border-border bg-card relative flex flex-col"
          >
            <p className="absolute -top-3 left-1/2 -translate-x-1/2 bg-foreground text-background px-3 py-1 text-xs font-bold tracking-wide">
              Recommended
            </p>

            <div className="p-4 space-y-4 flex-1 sm:p-6">
              <div className="space-y-1 sm:space-y-2">
                <h3 id="plan-pro" className="text-lg font-semibold text-foreground sm:text-xl">
                  Pro
                </h3>
                <Price amount={PRO_PRICE_USD} />
              </div>

              <ul className="space-y-3 text-sm">
                {PRO_FEATURES.map((feature) => (
                  <Feature key={feature.id}>
                    <strong>{feature.highlight}</strong>
                    {feature.rest}
                  </Feature>
                ))}
                <Feature>Everything in Free</Feature>
              </ul>

              <div className="pt-2 border-t border-border">
                <p className="text-xs font-medium text-foreground/60 mb-1.5">Need more?</p>
                <ul className="text-xs text-foreground/60 space-y-0.5 tabular-nums list-disc list-inside">
                  {ADD_ONS.map((addOn) => (
                    <li key={addOn}>{addOn}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="border-t-2 border-border p-4 sm:p-6 space-y-2">
              <button
                type="button"
                onClick={() => void handleProClick()}
                disabled={isLoading || hasPro || checkout.isPending}
                aria-busy={checkout.isPending}
                className={`block w-full text-center p-3 ${primaryButton}`}
              >
                {proButtonText}
              </button>
              {checkout.error && (
                <p role="alert" className="text-xs text-red-700 dark:text-red-400">
                  {checkout.error}
                </p>
              )}
            </div>
          </article>
        </div>
      </div>
    </SectionWrapper>
  );
}
