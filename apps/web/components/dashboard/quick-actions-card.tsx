"use client";

import { ChevronDown, ExternalLink, Mail } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { InstallSection } from "@/components/install-section";

export function QuickActionsCard() {
  const [isContactExpanded, setIsContactExpanded] = useState(false);

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
            <ExternalLink className="h-4 w-4 text-foreground/40 group-hover:text-foreground transition-colors" />
          </Link>

          <Link
            href="/docs"
            className="flex items-center justify-between gap-2 p-3 border border-border hover:border-foreground hover:bg-muted/50 transition-all group"
          >
            <span className="text-sm text-foreground">Documentation</span>
            <ExternalLink className="h-4 w-4 text-foreground/40 group-hover:text-foreground transition-colors" />
          </Link>

          <div className="border border-border">
            <button
              type="button"
              onClick={() => setIsContactExpanded(!isContactExpanded)}
              className="flex items-center justify-between gap-2 p-3 w-full hover:border-foreground hover:bg-muted/50 transition-all group"
            >
              <span className="text-sm text-foreground">Contact Us</span>
              <ChevronDown
                className={`h-4 w-4 text-foreground/40 group-hover:text-foreground transition-all ${
                  isContactExpanded ? "rotate-180" : ""
                }`}
              />
            </button>
            {isContactExpanded && (
              <div className="px-3 pb-3 space-y-3 border-t border-border pt-3">
                <p className="text-xs text-foreground/60 leading-relaxed">
                  For all support inquiries, including billing issues, receipts, and general
                  assistance, please email:
                </p>
                <a
                  href="mailto:can@cupo.la"
                  className="flex items-center gap-2 text-sm text-foreground hover:text-foreground/80 transition-colors group"
                >
                  <Mail className="h-4 w-4 text-foreground/40 group-hover:text-foreground transition-colors" />
                  <span className="font-mono">can@cupo.la</span>
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
