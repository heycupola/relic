import { cn } from "@repo/ui/lib/utils";
import { ArrowUpRight } from "lucide-react";
import type React from "react";
import type { ChangelogEntry, ReleaseType } from "@/lib/content";
import { focusRing } from "@/lib/styles";

const RELEASE_TYPE_LABELS: Record<ReleaseType, string> = {
  major: "Major",
  minor: "Minor",
  patch: "Patch",
};

function ReleaseBadge({
  children,
  filled = false,
}: {
  children: React.ReactNode;
  filled?: boolean;
}) {
  return (
    <span
      className={cn(
        "px-2 py-0.5 text-[10px] font-bold uppercase",
        filled ? "bg-foreground text-background" : "border border-border text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

interface ChangelogReleaseProps {
  entry: ChangelogEntry;
  content: React.ReactNode;
  isLatest?: boolean;
}

export function ChangelogRelease({ entry, content, isLatest = false }: ChangelogReleaseProps) {
  const titleId = `${entry.slug}-title`;

  return (
    <article
      id={entry.slug}
      aria-labelledby={titleId}
      className="grid scroll-mt-16 grid-cols-1 border-b border-border last:border-b-0 lg:grid-cols-[200px_minmax(0,1fr)]"
    >
      <div className="pt-8 pb-4 sm:pt-10 lg:pb-12 lg:pr-8">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 lg:sticky lg:top-24 lg:flex-col lg:items-start">
          <h2
            id={titleId}
            className="font-mono text-lg font-semibold tracking-tight text-foreground"
          >
            <a href={`#${entry.slug}`} className={`group inline-flex items-baseline ${focusRing}`}>
              {entry.version}
              <span
                aria-hidden="true"
                className="ml-1.5 text-sm font-normal text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
              >
                #
              </span>
            </a>
          </h2>
          <time dateTime={entry.isoDate} className="font-mono text-xs text-muted-foreground">
            {entry.formattedDate}
          </time>
          <div className="flex flex-wrap gap-1.5">
            {isLatest && <ReleaseBadge filled>Latest</ReleaseBadge>}
            {entry.deprecated && <ReleaseBadge>Deprecated</ReleaseBadge>}
            {entry.releaseType && (
              <ReleaseBadge>{RELEASE_TYPE_LABELS[entry.releaseType]}</ReleaseBadge>
            )}
          </div>
          {entry.releaseUrl && (
            <a
              href={entry.releaseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`group inline-flex items-center gap-1 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground ${focusRing}`}
            >
              GitHub release
              <ArrowUpRight
                className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-px group-hover:translate-x-px"
                aria-hidden="true"
              />
            </a>
          )}
        </div>
      </div>

      <div className="relative pb-10 sm:pb-12 lg:border-l lg:border-border lg:pt-10 lg:pl-10">
        <span
          aria-hidden="true"
          className={cn(
            "absolute top-[2.9rem] -left-[5px] hidden h-[11px] w-[11px] lg:block",
            isLatest ? "bg-foreground" : "border-2 border-border bg-background",
          )}
        />
        <div
          className={cn("content-prose content-prose-compact", entry.deprecated && "opacity-80")}
        >
          {content}
        </div>
      </div>
    </article>
  );
}
