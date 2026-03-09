import Link from "next/link";
import type { ContentEntry } from "@/lib/content";

interface ContentCardProps {
  entry: ContentEntry;
}

export function ContentCard({ entry }: ContentCardProps) {
  return (
    <Link
      href={entry.href}
      className="group flex h-full flex-col overflow-hidden border-2 border-border bg-card transition-colors hover:border-foreground/40"
    >
      <div className="aspect-[1.91/1] border-b-2 border-border bg-muted">
        <img src={entry.ogImagePath} alt="" className="h-full w-full object-cover" />
      </div>
      <div className="flex flex-1 flex-col gap-4 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3 font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
          <span>{entry.collection}</span>
          <span>{entry.formattedDate}</span>
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-semibold tracking-tight text-balance text-foreground">
            {entry.title}
          </h2>
          <p className="text-sm leading-relaxed text-foreground/65">{entry.description}</p>
        </div>
        <div className="mt-auto flex flex-wrap items-center gap-3 pt-3 text-xs text-foreground/45">
          <span>{entry.readingTimeText}</span>
          {entry.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="border border-border px-2 py-1 uppercase tracking-[0.18em]">
              {tag}
            </span>
          ))}
        </div>
      </div>
    </Link>
  );
}
