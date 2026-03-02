"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect } from "react";
import { StatusBox } from "@/components/status-box";
import { trackWebEvent } from "@/lib/posthog";
import { authHeadingStyle } from "@/lib/styles";

export default function SubscriptionCancelPage() {
  useEffect(() => {
    trackWebEvent("web_subscription_cancelled");
  }, []);

  return (
    <div className="min-h-dvh bg-background text-foreground flex items-center justify-center">
      <div className="w-full max-w-md px-6 py-16">
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

          <h1 className="text-2xl font-medium text-foreground" style={authHeadingStyle}>
            Payment cancelled
          </h1>

          <StatusBox variant="info">
            Your payment was cancelled and no charges were made. You can upgrade to Pro anytime from
            the CLI.
          </StatusBox>

          <Link
            href="/"
            className="w-full p-3 text-sm font-medium text-center border-2 border-border bg-foreground text-background hover:bg-foreground/90 transition-colors"
          >
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
