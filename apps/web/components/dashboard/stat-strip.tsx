import { cn } from "@repo/ui/lib/utils";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { type Tone, tone } from "./primitives";

export interface Stat {
  label: string;
  value: ReactNode;
  hint: ReactNode;
  icon: LucideIcon;
  hintTone?: Tone;
}

export function StatStrip({ stats, isLoading }: { stats: Stat[]; isLoading?: boolean }) {
  return (
    <dl className="grid grid-cols-2 gap-px border-2 border-border bg-border lg:grid-cols-4">
      {stats.map(({ label, value, hint, icon: Icon, hintTone }) => (
        <div key={label} className="flex flex-col gap-2 bg-card p-4 sm:p-5">
          <dt className="flex items-center gap-2 text-xs text-muted-foreground">
            <Icon className="size-3.5" aria-hidden="true" />
            {label}
          </dt>
          {isLoading ? (
            <dd aria-hidden="true" className="space-y-2 animate-pulse motion-reduce:animate-none">
              <div className="h-7 w-12 bg-muted" />
              <div className="h-3 w-20 bg-muted/70" />
            </dd>
          ) : (
            <dd className="space-y-1">
              <div className="truncate font-[family-name:var(--font-heading)] text-2xl font-semibold tabular-nums text-foreground sm:text-3xl">
                {value}
              </div>
              <div
                className={cn(
                  "truncate text-xs",
                  hintTone ? tone[hintTone] : "text-muted-foreground",
                )}
              >
                {hint}
              </div>
            </dd>
          )}
        </div>
      ))}
    </dl>
  );
}
