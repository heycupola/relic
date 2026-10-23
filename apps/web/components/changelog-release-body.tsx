"use client";

import { cn } from "@repo/ui/lib/utils";
import { ChevronDown } from "lucide-react";
import type React from "react";
import { useEffect, useId, useState } from "react";
import { focusRing } from "@/lib/styles";

interface ChangelogReleaseBodyProps {
  slug: string;
  collapsible: boolean;
  children: React.ReactNode;
}

export function ChangelogReleaseBody({ slug, collapsible, children }: ChangelogReleaseBodyProps) {
  const panelId = useId();
  const [expanded, setExpanded] = useState(!collapsible);

  useEffect(() => {
    if (!collapsible) return;
    const syncFromHash = () => {
      const hash = decodeURIComponent(window.location.hash.slice(1));
      if (hash === slug) setExpanded(true);
    };
    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, [collapsible, slug]);

  if (!collapsible) {
    return <>{children}</>;
  }

  return (
    <div className="relative">
      <div
        id={panelId}
        className={cn(
          "relative transition-[max-height] duration-300 ease-out",
          !expanded && "max-h-[min(22rem,70vh)] overflow-hidden",
        )}
      >
        {children}
        {!expanded && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background via-background/95 to-transparent"
          />
        )}
      </div>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setExpanded((open) => !open)}
        className={`mt-4 inline-flex items-center gap-1.5 border-2 border-border bg-background px-3 py-2 font-mono text-xs uppercase tracking-[0.18em] text-foreground transition-colors hover:border-foreground/40 hover:bg-muted/50 ${focusRing}`}
      >
        {expanded ? "Show less" : "View all"}
        <ChevronDown
          className={cn("h-4 w-4 transition-transform duration-200", expanded && "rotate-180")}
          aria-hidden="true"
        />
      </button>
    </div>
  );
}
