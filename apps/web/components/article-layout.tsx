import Link from "next/link";
import type React from "react";
import type { ContentEntry } from "@/lib/content";

interface ArticleLayoutProps {
  entry: ContentEntry;
  children: React.ReactNode;
  backHref: string;
  backLabel: string;
  externalHref?: string;
  externalLabel?: string;
  previousHref?: string;
  previousLabel?: string;
  nextHref?: string;
  nextLabel?: string;
}

export function ArticleLayout({
  entry,
  children,
  backHref,
  backLabel,
  externalHref,
  externalLabel,
  previousHref,
  previousLabel,
  nextHref,
  nextLabel,
}: ArticleLayoutProps) {
  return (
    <>
      <section className="border-b border-border">
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10 lg:px-12">
          <div className="flex flex-col gap-5 border-2 border-border bg-card p-5 sm:p-8">
            <div className="flex flex-wrap items-center gap-3 font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
              <span>{entry.collection}</span>
              <span aria-hidden="true">/</span>
              <span>{entry.formattedDate}</span>
              <span aria-hidden="true">/</span>
              <span>{entry.readingTimeText}</span>
            </div>
            <div className="space-y-4">
              <h1 className="max-w-4xl text-3xl font-semibold tracking-tight text-balance text-foreground sm:text-4xl md:text-5xl">
                {entry.title}
              </h1>
              <p className="max-w-2xl text-base leading-relaxed text-foreground/65 sm:text-lg">
                {entry.description}
              </p>
            </div>
            {entry.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {entry.tags.map((tag) => (
                  <span
                    key={tag}
                    className="border border-border px-2 py-1 font-mono text-[11px] uppercase tracking-[0.2em]"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="border-b border-border">
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-0 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_240px] lg:px-12">
          <article className="border-x border-border px-5 py-6 sm:px-8 sm:py-8">
            <div className="content-prose">{children}</div>
          </article>
          <aside className="border-r border-border px-5 py-6 sm:px-8 sm:py-8 lg:px-6">
            <div className="sticky top-24 space-y-5">
              <div className="flex flex-wrap gap-2">
                <Link
                  href={backHref}
                  className="inline-flex border border-border px-3 py-2 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:bg-foreground hover:text-background"
                >
                  {backLabel}
                </Link>
                {externalHref && externalLabel && (
                  <Link
                    href={externalHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex border border-border px-3 py-2 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:bg-foreground hover:text-background"
                  >
                    {externalLabel}
                  </Link>
                )}
              </div>
              <div className="space-y-3 border-t border-border pt-4 text-sm">
                {previousHref && previousLabel && (
                  <div className="space-y-1">
                    <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                      Previous
                    </div>
                    <Link
                      href={previousHref}
                      className="text-foreground/70 transition-colors hover:text-foreground"
                    >
                      {previousLabel}
                    </Link>
                  </div>
                )}
                {nextHref && nextLabel && (
                  <div className="space-y-1">
                    <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                      Next
                    </div>
                    <Link
                      href={nextHref}
                      className="text-foreground/70 transition-colors hover:text-foreground"
                    >
                      {nextLabel}
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}
