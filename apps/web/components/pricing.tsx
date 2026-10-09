"use client";

import { api } from "@repo/backend";
import { useConvexAuth, useQuery } from "convex/react";
import { Check, X } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useProCheckout } from "@/hooks/useProCheckout";
import { SectionWrapper } from "./section-wrapper";

const UPGRADE_LOGIN_URL = `/login?returnUrl=${encodeURIComponent("/dashboard?action=upgrade")}`;

const buttonFocus =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground";

function Feature({ included = true, children }: { included?: boolean; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      {included ? (
        <Check className="h-4 w-4 text-electric-ink shrink-0 mt-0.5" aria-hidden="true" />
      ) : (
        <X className="h-4 w-4 text-foreground/30 shrink-0 mt-0.5" aria-hidden="true" />
      )}
      <span className={included ? "text-foreground" : "text-foreground/50"}>{children}</span>
    </li>
  );
}

function Price({ amount }: { amount: string }) {
  return (
    <p className="flex items-baseline gap-1">
      <span className="text-3xl font-bold text-foreground tabular-nums sm:text-4xl">{amount}</span>
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
                <Price amount="$0" />
              </div>

              <ul className="space-y-3 text-sm">
                <Feature>1 project</Feature>
                <Feature>Activity logs & analytics</Feature>
                <Feature>Fully encrypted</Feature>
                <Feature>CLI & TUI access</Feature>
                <Feature included={false}>No project sharing</Feature>
                <Feature included={false}>No CI/CD integration</Feature>
              </ul>
            </div>

            {!hasPro && (
              <div className="border-t-2 border-border p-4 sm:p-6">
                <button
                  type="button"
                  onClick={handleFreeClick}
                  disabled={isLoading}
                  className={`block w-full text-center p-3 border-2 border-border bg-background text-foreground font-medium hover:bg-muted/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${buttonFocus}`}
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
                <Price amount="$9" />
              </div>

              <ul className="space-y-3 text-sm">
                <Feature>
                  <strong>Collaborate on projects</strong>, 5 collaborators per project included
                </Feature>
                <Feature>
                  <strong>5 projects</strong> included
                </Feature>
                <Feature>
                  <strong>Service accounts & OIDC</strong> for CI/CD
                </Feature>
                <Feature>
                  <strong>API keys</strong> for programmatic access
                </Feature>
                <Feature>Activity logs & analytics</Feature>
                <Feature>
                  <strong>Early access</strong> to new features
                </Feature>
                <Feature>Everything in Free</Feature>
              </ul>

              <div className="pt-2 border-t border-border/50">
                <p className="text-xs font-medium text-foreground/50 mb-1.5">Need more?</p>
                <ul className="text-xs text-foreground/60 space-y-0.5 tabular-nums list-disc list-inside">
                  <li>Additional projects: $2 each</li>
                  <li>Additional collaborators: $1 each</li>
                </ul>
              </div>
            </div>

            <div className="border-t-2 border-border p-4 sm:p-6 space-y-2">
              <button
                type="button"
                onClick={() => void handleProClick()}
                disabled={isLoading || hasPro || checkout.isPending}
                aria-busy={checkout.isPending}
                className={`block w-full text-center p-3 border-2 border-foreground bg-foreground text-background font-medium hover:bg-foreground/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${buttonFocus}`}
              >
                {proButtonText}
              </button>
              {checkout.error && (
                <p role="alert" className="text-xs text-red-600 dark:text-red-400">
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
