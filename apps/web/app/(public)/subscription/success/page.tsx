"use client";

import { api } from "@repo/backend";
import { useAction, useConvexAuth } from "convex/react";
import { Check } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { trackWebEvent } from "@/lib/posthog";
import { authHeadingStyle, authSubtitleStyle } from "@/lib/styles";

type Activation = "pending" | "active" | "delayed";

const RETRY_DELAYS_MS = [0, 1500, 3000, 6000];

/** Pulls the new plan from Autumn right away instead of waiting for the webhook. */
function usePlanActivation(): Activation {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const refreshMyPlan = useAction(api.billing.refreshMyPlan);
  const [state, setState] = useState<Activation>("pending");

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      setState("delayed");
      return;
    }

    let cancelled = false;
    void (async () => {
      for (const delay of RETRY_DELAYS_MS) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        if (cancelled) return;
        try {
          if ((await refreshMyPlan({})).hasPro) {
            if (!cancelled) setState("active");
            return;
          }
        } catch {
          // Retried below; the webhook will still activate the plan.
        }
      }
      if (!cancelled) setState("delayed");
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isLoading, refreshMyPlan]);

  return state;
}

const ACTIVATION_COPY: Record<Activation, string> = {
  pending: "Activating your plan…",
  active: "Your Pro plan is active.",
  delayed: "Your payment went through. Pro features will unlock in a moment.",
};

export default function SubscriptionSuccessPage() {
  const activation = usePlanActivation();

  useEffect(() => {
    trackWebEvent("web_subscription_completed");
  }, []);

  return (
    <div className="min-h-dvh bg-background text-foreground flex items-center justify-center">
      <div className="w-full max-w-md px-4 py-10 sm:px-6 sm:py-16">
        <div className="flex flex-col gap-8">
          <Link href="/" className="flex items-center">
            <Image
              src="/relic-logo-dark.svg"
              alt="Relic"
              width={40}
              height={40}
              className="h-10 w-auto dark:hidden"
            />
            <Image
              src="/relic-logo-light.svg"
              alt="Relic"
              width={40}
              height={40}
              className="h-10 w-auto hidden dark:block"
            />
          </Link>

          <div className="space-y-3">
            <h1 className="text-2xl font-medium text-foreground" style={authHeadingStyle}>
              Welcome to Relic Pro
            </h1>
            <p className="text-sm text-muted-foreground" style={authSubtitleStyle}>
              Your upgrade is complete. Here's what you can do now.
            </p>
            <p role="status" className="text-xs text-foreground/60">
              {ACTIVATION_COPY[activation]}
            </p>
          </div>

          <ul className="space-y-3 text-sm">
            <li className="flex items-start gap-2">
              <Check className="h-4 w-4 text-electric-ink shrink-0 mt-0.5" aria-hidden="true" />
              <span className="text-foreground">Share projects with your team</span>
            </li>
            <li className="flex items-start gap-2">
              <Check className="h-4 w-4 text-electric-ink shrink-0 mt-0.5" aria-hidden="true" />
              <span className="text-foreground">5 projects included</span>
            </li>
            <li className="flex items-start gap-2">
              <Check className="h-4 w-4 text-electric-ink shrink-0 mt-0.5" aria-hidden="true" />
              <span className="text-foreground">Early access to new features</span>
            </li>
          </ul>

          <Link
            href="/dashboard"
            className="w-full p-3 text-sm font-medium text-center border-2 border-border bg-foreground text-background hover:bg-foreground/90 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
