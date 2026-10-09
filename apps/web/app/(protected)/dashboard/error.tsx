"use client";

import { useEffect } from "react";
import { primaryButton, secondaryButton } from "@/lib/styles";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard error:", error);
  }, [error]);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8 lg:px-12">
      <section
        role="alert"
        aria-labelledby="dashboard-error-heading"
        className="border-2 border-border bg-card p-4 space-y-4 sm:p-5"
      >
        <div className="space-y-1.5">
          <h1 id="dashboard-error-heading" className="text-base font-semibold text-foreground">
            Something went wrong
          </h1>
          <p className="text-sm text-foreground/70 leading-relaxed text-pretty">
            We couldn&apos;t load this part of your dashboard. Your secrets are safe; this is a
            display problem on our side.
          </p>
          {error.digest && (
            <p className="font-mono text-xs text-muted-foreground">Reference: {error.digest}</p>
          )}
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <button type="button" onClick={reset} className={`px-4 py-2.5 text-sm ${primaryButton}`}>
            Try again
          </button>
          <a
            href="mailto:support@withrelic.com"
            className={`px-4 py-2.5 text-sm text-center ${secondaryButton}`}
          >
            Contact support
          </a>
        </div>
      </section>
    </div>
  );
}
