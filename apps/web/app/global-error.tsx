"use client";

import "./globals.css";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled error:", error);
  }, [error]);

  useEffect(() => {
    if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      document.documentElement.classList.add("dark");
    }
  }, []);

  return (
    <html lang="en">
      <head>
        <title>Something went wrong - Relic</title>
      </head>
      <body className="min-h-dvh bg-background text-foreground font-sans antialiased">
        <main className="flex min-h-dvh items-center justify-center px-4 py-10 sm:px-6">
          <div role="alert" className="w-full max-w-md space-y-6">
            <p className="font-mono text-xs text-muted-foreground">Relic</p>
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold text-foreground">Something went wrong</h1>
              <p className="text-sm text-foreground/70 leading-relaxed text-pretty">
                An unexpected error stopped this page from loading. Your secrets are encrypted and
                unaffected.
              </p>
              {error.digest && (
                <p className="font-mono text-xs text-muted-foreground">Reference: {error.digest}</p>
              )}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={reset}
                className="px-4 py-3 text-sm border-2 border-foreground bg-foreground text-background font-medium hover:bg-foreground/90 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
              >
                Try again
              </button>
              {/* Plain anchor: the router may be the thing that failed. */}
              <a
                href="/"
                className="px-4 py-3 text-sm text-center border-2 border-border bg-background text-foreground hover:bg-muted/50 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
              >
                Go home
              </a>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
