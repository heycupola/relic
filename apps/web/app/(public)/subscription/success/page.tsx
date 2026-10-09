"use client";

import { api } from "@repo/backend";
import { useAction, useConvexAuth } from "convex/react";
import { Check } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { PRO_FEATURES } from "@/lib/plans";
import { trackWebEvent } from "@/lib/posthog";
import { authHeadingStyle, authSubtitleStyle, focusRing, primaryButton } from "@/lib/styles";

type Activation = "pending" | "active" | "delayed" | "signed_out";

const RETRY_DELAYS_MS = [0, 1500, 3000, 6000];

/** Pulls the new plan from Autumn right away instead of waiting for the webhook. */
function usePlanActivation(): Activation {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const refreshMyPlan = useAction(api.billing.refreshMyPlan);
  const [state, setState] = useState<Activation>("pending");

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      setState("signed_out");
      return;
    }

    setState("pending");
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

const COPY: Record<Activation, { title: string; subtitle: string; status?: string }> = {
  pending: {
    title: "Finishing your upgrade",
    subtitle: "Thanks for upgrading. Here's what you get with Pro.",
    status: "Activating your plan…",
  },
  active: {
    title: "Welcome to Relic Pro",
    subtitle: "Your upgrade is complete. Here's what you can do now.",
    status: "Your Pro plan is active.",
  },
  delayed: {
    title: "Payment received",
    subtitle: "Thanks for upgrading. Here's what you get with Pro.",
    status: "Your payment went through. Pro features will unlock in a moment.",
  },
  signed_out: {
    title: "Check your subscription",
    subtitle: "Sign in to see your plan and manage your subscription.",
  },
};

export default function SubscriptionSuccessPage() {
  const activation = usePlanActivation();
  const tracked = useRef(false);
  const copy = COPY[activation];
  const signedOut = activation === "signed_out";

  useEffect(() => {
    if (activation !== "active" || tracked.current) return;
    tracked.current = true;
    trackWebEvent("web_subscription_completed");
  }, [activation]);

  return (
    <div className="min-h-dvh bg-background text-foreground flex items-center justify-center">
      <div className="w-full max-w-md px-4 py-10 sm:px-6 sm:py-16">
        <div className="flex flex-col gap-8">
          <Link href="/" className={`flex w-fit items-center ${focusRing}`}>
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
              {copy.title}
            </h1>
            <p className="text-sm text-muted-foreground" style={authSubtitleStyle}>
              {copy.subtitle}
            </p>
            {copy.status && (
              <p role="status" className="text-xs text-foreground/60">
                {copy.status}
              </p>
            )}
          </div>

          {!signedOut && (
            <ul className="space-y-3 text-sm">
              {PRO_FEATURES.map((feature) => (
                <li key={feature.id} className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-electric-ink shrink-0 mt-0.5" aria-hidden="true" />
                  <span className="text-foreground">
                    <strong>{feature.highlight}</strong>
                    {feature.rest}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <Link
            href={signedOut ? "/login?returnUrl=/dashboard" : "/dashboard"}
            className={`w-full p-3 text-sm text-center ${primaryButton}`}
          >
            {signedOut ? "Sign in" : "Go to dashboard"}
          </Link>
        </div>
      </div>
    </div>
  );
}
