"use client";

import { Check, X } from "lucide-react";
import Link from "next/link";
import { SectionWrapper } from "./section-wrapper";

export function Pricing() {
  return (
    <SectionWrapper label="Pricing" id="pricing">
      <div className="mx-auto max-w-6xl px-6 py-16 lg:px-12">
        <h2 className="text-2xl font-semibold text-foreground">Pricing</h2>
        <p className="mt-2 text-foreground/60">Built for collaboration, flexible for your needs.</p>

        <div className="mt-12 grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Free Plan */}
          <div className="border-2 border-border bg-card flex flex-col">
            <div className="p-6 space-y-4 flex-1">
              <div className="space-y-2">
                <h3 className="text-xl font-semibold text-foreground">Free</h3>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-foreground">$0</span>
                  <span className="text-foreground/60">/month</span>
                </div>
              </div>

              <ul className="space-y-3 text-sm">
                <li className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
                  <span className="text-foreground">1 project</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
                  <span className="text-foreground">Activity logs & analytics</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
                  <span className="text-foreground">Zero-knowledge encryption</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
                  <span className="text-foreground">CLI & TUI access</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
                  <span className="text-foreground">SDK support (JS, Python, Go, Rust)</span>
                </li>
                <li className="flex items-start gap-2">
                  <X className="h-4 w-4 text-foreground/30 shrink-0 mt-0.5" />
                  <span className="text-foreground/50">No project sharing</span>
                </li>
              </ul>
            </div>

            <div className="border-t-2 border-border p-6">
              <Link
                href="/login"
                className="block w-full text-center p-3 border-2 border-border bg-background text-foreground font-medium hover:bg-muted/50 transition-colors"
              >
                Get started
              </Link>
            </div>
          </div>

          {/* Pro Plan */}
          <div className="border-2 border-border bg-card relative flex flex-col">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <span className="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-3 py-1 text-xs font-bold">
                RECOMMENDED
              </span>
            </div>

            <div className="p-6 space-y-4 flex-1">
              <div className="space-y-2">
                <h3 className="text-xl font-semibold text-foreground">Pro</h3>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-foreground">$20</span>
                  <span className="text-foreground/60">/month</span>
                </div>
              </div>

              <ul className="space-y-3 text-sm">
                <li className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
                  <span className="text-foreground">
                    <strong>Collaborate on projects</strong> - 5 free shares per project
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
                  <span className="text-foreground">
                    <strong>5 free projects</strong> included
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
                  <span className="text-foreground">Activity logs & analytics</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
                  <span className="text-foreground">
                    <strong>Early access</strong> to new features
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
                  <span className="text-foreground">Everything in Free</span>
                </li>
              </ul>

              <div className="pt-2 border-t border-border/50">
                <p className="text-xs font-medium text-foreground/50 mb-1.5">Need more?</p>
                <div className="text-xs text-foreground/60 space-y-0.5">
                  <p>• Additional projects: $10 each</p>
                  <p>• Additional shares: $5 each</p>
                </div>
              </div>
            </div>

            <div className="border-t-2 border-border p-6">
              <Link
                href="/login"
                className="block w-full text-center p-3 border-2 border-foreground bg-foreground text-background font-medium hover:bg-foreground/90 transition-colors"
              >
                Upgrade to Pro
              </Link>
            </div>
          </div>
        </div>
      </div>
    </SectionWrapper>
  );
}
