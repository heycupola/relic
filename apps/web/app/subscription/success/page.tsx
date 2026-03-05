"use client";

import { Check } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect } from "react";
import { trackWebEvent } from "@/lib/posthog";
import { authHeadingStyle, authSubtitleStyle } from "@/lib/styles";

export default function SubscriptionSuccessPage() {
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
          </div>

          <ul className="space-y-3 text-sm">
            <li className="flex items-start gap-2">
              <Check className="h-4 w-4 text-electric-ink shrink-0 mt-0.5" aria-hidden="true" />
              <span className="text-foreground">Share projects with your team</span>
            </li>
            <li className="flex items-start gap-2">
              <Check className="h-4 w-4 text-electric-ink shrink-0 mt-0.5" aria-hidden="true" />
              <span className="text-foreground">Up to 5 projects included</span>
            </li>
            <li className="flex items-start gap-2">
              <Check className="h-4 w-4 text-electric-ink shrink-0 mt-0.5" aria-hidden="true" />
              <span className="text-foreground">Early access to new features</span>
            </li>
          </ul>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/dashboard"
              className="flex-1 p-3 text-sm font-medium text-center border-2 border-border bg-foreground text-background hover:bg-foreground/90 transition-colors"
            >
              Go to Dashboard
            </Link>
            <Link
              href="/"
              className="flex-1 p-3 text-sm font-medium text-center border-2 border-border bg-background text-foreground hover:bg-muted/50 transition-colors"
            >
              Back to home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
