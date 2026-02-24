"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect } from "react";
import { AuthFooter } from "@/components/auth-footer";
import { trackWebEvent } from "@/lib/posthog";
import { authHeadingStyle, authSubtitleStyle } from "@/lib/styles";

export default function SubscriptionSuccessPage() {
  useEffect(() => {
    trackWebEvent("web_subscription_completed");
  }, []);
  return (
    <div className="min-h-dvh bg-background text-foreground flex items-center justify-center">
      <div className="w-full py-16">
        <div className="flex flex-col items-center gap-10">
          <div className="flex flex-col items-center gap-8">
            <Link href="/" className="flex items-center">
              <Image
                src="/relic-logo-wordmark-dark.svg"
                alt="Relic"
                width={119}
                height={48}
                className="h-12 w-auto dark:hidden"
              />
              <Image
                src="/relic-logo-wordmark-light.svg"
                alt="Relic"
                width={119}
                height={48}
                className="h-12 w-auto hidden dark:block"
              />
            </Link>

            <div className="text-center space-y-3">
              <div className="flex items-center justify-center mb-6">
                <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center">
                  <svg
                    className="w-8 h-8 text-emerald-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    role="img"
                    aria-label="Success checkmark"
                  >
                    <title>Success</title>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
              </div>
              <h1 className="text-3xl font-medium text-foreground" style={authHeadingStyle}>
                payment successful
              </h1>
              <p className="text-sm font-light text-muted-foreground" style={authSubtitleStyle}>
                thank you for upgrading to pro
              </p>
            </div>
          </div>

          <div className="w-full max-w-sm space-y-4">
            <div className="bg-card border border-border rounded-lg p-6 space-y-4">
              <div className="text-center space-y-2">
                <p className="text-sm text-muted-foreground text-pretty">
                  your pro plan is now active. you can now share projects with your team and access
                  all Pro features.
                </p>
              </div>
            </div>

            <div className="text-center space-y-3">
              <p className="text-sm text-muted-foreground">
                return to the cli to continue where you left off
              </p>
              <Link
                href="/"
                className="inline-flex items-center justify-center gap-2 text-sm text-foreground hover:text-muted-foreground transition-colors"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 19l-7-7m0 0l7-7m-7 7h18"
                  />
                </svg>
                back to home
              </Link>
            </div>
          </div>

          <AuthFooter />
        </div>
      </div>
    </div>
  );
}
