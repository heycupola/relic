"use client";

import { cn } from "@repo/ui/lib/utils";
import { ChevronDown, ExternalLink, Mail } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { InstallSection } from "@/components/install-section";

export function QuickActionsCard() {
  const [isContactExpanded, setIsContactExpanded] = useState(false);
  const docsUrl = "https://docs.relic.so";

  return (
    <div className="border-2 border-border bg-card p-5">
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-foreground/60">Quick Actions</h3>

        <div className="space-y-2">
          <InstallSection showWrapper={false} />

          <Link
            href="https://github.com/heycupola/relic/releases"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between gap-2 p-3 border border-border hover:border-foreground hover:bg-muted/50 transition-all group"
          >
            <span className="text-sm text-foreground">Download binaries</span>
            <ExternalLink
              className="h-4 w-4 text-foreground/40 group-hover:text-foreground transition-colors"
              aria-hidden="true"
            />
          </Link>

          <Link
            href={docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between gap-2 p-3 border border-border hover:border-foreground hover:bg-muted/50 transition-all group"
          >
            <span className="text-sm text-foreground">Documentation</span>
            <ExternalLink
              className="h-4 w-4 text-foreground/40 group-hover:text-foreground transition-colors"
              aria-hidden="true"
            />
          </Link>

          <div className="border border-border">
            <button
              type="button"
              onClick={() => setIsContactExpanded(!isContactExpanded)}
              className={cn(
                "w-full text-left p-3 transition-colors",
                isContactExpanded ? "bg-foreground/5" : "hover:bg-muted/50",
              )}
              aria-expanded={isContactExpanded}
              aria-controls="contact-content"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-foreground">Contact Us</span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 text-foreground/40 transition-transform duration-200",
                    isContactExpanded && "rotate-180",
                  )}
                  aria-hidden="true"
                />
              </div>
              <div
                id="contact-content"
                className={cn(
                  "overflow-hidden transition-all duration-200",
                  isContactExpanded ? "mt-3 max-h-40" : "max-h-0",
                )}
              >
                <div className="space-y-3">
                  <p className="text-xs text-foreground/60 leading-relaxed text-pretty">
                    For all support inquiries, including billing issues, receipts, and general
                    assistance, please email:
                  </p>
                  <a
                    href="mailto:can@cupo.la"
                    className="flex items-center gap-2 text-sm text-foreground hover:text-foreground/80 transition-colors group"
                  >
                    <Mail
                      className="h-4 w-4 text-foreground/40 group-hover:text-foreground transition-colors"
                      aria-hidden="true"
                    />
                    <span className="font-mono">can@cupo.la</span>
                  </a>
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
