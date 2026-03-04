"use client";

import { api } from "@repo/backend";
import { useAction, useConvexAuth, useQuery } from "convex/react";
import { Check, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SectionWrapper } from "./section-wrapper";

export function Pricing() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const userData = useQuery(api.user.getCurrentUser, isAuthenticated ? {} : "skip");
  const getProPlan = useAction(api.user.getProPlan);
  const [isUpgrading, setIsUpgrading] = useState(false);

  const hasPro = userData?.hasPro || false;

  const handleFreeClick = () => {
    if (isLoading) return;

    if (isAuthenticated) {
      router.push("/dashboard");
    } else {
      router.push("/login?returnUrl=/dashboard");
    }
  };

  const handleProClick = async () => {
    if (isLoading) return;

    if (!isAuthenticated) {
      router.push("/login?returnUrl=/dashboard&action=upgrade");
      return;
    }

    if (hasPro) {
      return;
    }

    setIsUpgrading(true);
    try {
      const result = await getProPlan({});
      if (result.checkoutLink) {
        window.location.href = result.checkoutLink;
      }
    } catch (error) {
      console.error("Failed to get checkout link:", error);
      setIsUpgrading(false);
    }
  };

  const getProButtonText = () => {
    if (isLoading || isUpgrading) return "Loading…";
    if (hasPro) return "Current Plan";
    return "Upgrade to Pro";
  };

  const getFreeButtonText = () => {
    if (isLoading) return "Loading…";
    return "Get started";
  };

  return (
    <SectionWrapper label="Pricing" id="pricing">
      <div className="mx-auto max-w-6xl px-6 py-16 lg:px-12">
        <h2 className="text-2xl font-semibold text-foreground">Pricing</h2>
        <p className="mt-2 text-foreground/60 text-pretty">Simple pricing. No surprises.</p>

        <div className="mt-12 grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Free Plan */}
          <div className="border-2 border-border bg-card flex flex-col">
            <div className="p-6 space-y-4 flex-1">
              <div className="space-y-2">
                <h3 className="text-xl font-semibold text-foreground">Free</h3>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-foreground tabular-nums">$0</span>
                  <span className="text-foreground/60">/month</span>
                </div>
              </div>

              <ul className="space-y-3 text-sm">
                <li className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-electric-ink shrink-0 mt-0.5" aria-hidden="true" />
                  <span className="text-foreground">1 project</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-electric-ink shrink-0 mt-0.5" aria-hidden="true" />
                  <span className="text-foreground">Activity logs & analytics</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-electric-ink shrink-0 mt-0.5" aria-hidden="true" />
                  <span className="text-foreground">Fully encrypted</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-electric-ink shrink-0 mt-0.5" aria-hidden="true" />
                  <span className="text-foreground">CLI & TUI access</span>
                </li>
                <li className="flex items-start gap-2">
                  <X className="h-4 w-4 text-foreground/30 shrink-0 mt-0.5" aria-hidden="true" />
                  <span className="text-foreground/50">No project sharing</span>
                </li>
              </ul>
            </div>

            <div className="border-t-2 border-border p-6">
              <button
                type="button"
                onClick={handleFreeClick}
                disabled={isLoading}
                className="block w-full text-center p-3 border-2 border-border bg-background text-foreground font-medium hover:bg-muted/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {getFreeButtonText()}
              </button>
            </div>
          </div>

          {/* Pro Plan */}
          <div className="border-2 border-border bg-card relative flex flex-col">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <span className="bg-foreground text-background px-3 py-1 text-xs font-bold">
                RECOMMENDED
              </span>
            </div>

            <div className="p-6 space-y-4 flex-1">
              <div className="space-y-2">
                <h3 className="text-xl font-semibold text-foreground">Pro</h3>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-foreground tabular-nums">$20</span>
                  <span className="text-foreground/60">/month</span>
                </div>
              </div>

              <ul className="space-y-3 text-sm">
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

              <div className="pt-2 border-t border-border/50">
                <p className="text-xs font-medium text-foreground/50 mb-1.5">Need more?</p>
                <div className="text-xs text-foreground/60 space-y-0.5 tabular-nums">
                  <p>• Additional projects: $10 each</p>
                  <p>• Additional shares: $5 each</p>
                </div>
              </div>
            </div>

            <div className="border-t-2 border-border p-6">
              <button
                type="button"
                onClick={handleProClick}
                disabled={isLoading || hasPro || isUpgrading}
                className="block w-full text-center p-3 border-2 border-foreground bg-foreground text-background font-medium hover:bg-foreground/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {getProButtonText()}
              </button>
            </div>
          </div>
        </div>
      </div>
    </SectionWrapper>
  );
}
