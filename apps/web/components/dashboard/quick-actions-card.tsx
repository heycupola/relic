"use client";

import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { InstallSection } from "@/components/install-section";

export function QuickActionsCard() {
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
        </div>
      </div>
    </div>
  );
}
