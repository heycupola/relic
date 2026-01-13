"use client";

import Link from "next/link";
import { AuthFooter } from "@/components/auth-footer";
import { RelicLogo } from "@/components/relic-logo";
import { authHeadingStyle, authSubtitleStyle } from "@/lib/styles";

export default function SubscriptionCancelPage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
      <div className="w-full py-16">
        <div className="flex flex-col items-center gap-10">
          <div className="flex flex-col items-center gap-8">
            <Link href="/" className="flex items-center">
              <RelicLogo className="h-12 text-foreground" />
            </Link>

            <div className="text-center space-y-3">
              <div className="flex items-center justify-center mb-6">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                  <svg
                    className="w-8 h-8 text-muted-foreground"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    role="img"
                    aria-label="Cancelled"
                  >
                    <title>Cancelled</title>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </div>
              </div>
              <h1 className="text-3xl font-medium text-foreground" style={authHeadingStyle}>
                payment cancelled
              </h1>
              <p className="text-sm font-light text-muted-foreground" style={authSubtitleStyle}>
                no worries, you can try again anytime
              </p>
            </div>
          </div>

          <div className="w-full max-w-sm space-y-4">
            <div className="bg-card border border-border rounded-lg p-6 space-y-4">
              <div className="text-center space-y-2">
                <p className="text-sm text-muted-foreground">
                  your payment was cancelled and no charges were made. you can upgrade to pro
                  anytime from the cli.
                </p>
              </div>
            </div>

            <div className="text-center space-y-3">
              <p className="text-sm text-muted-foreground">return to the cli to continue</p>
              <Link
                href="/"
                className="inline-flex items-center justify-center gap-2 text-sm text-foreground hover:text-muted-foreground transition-colors"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  role="img"
                  aria-label="Back arrow"
                >
                  <title>Back</title>
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
