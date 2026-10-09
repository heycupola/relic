"use client";

import { cn } from "@repo/ui/lib/utils";
import { Check, Copy, type LucideIcon, X } from "lucide-react";
import { type ReactNode, useId } from "react";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import { focusRing } from "@/lib/styles";

/** Scrollbar styling shared by the scrollable lists on the dashboard. */
export const thinScrollbar =
  "[&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-foreground/15 [&::-webkit-scrollbar-thumb]:hover:bg-foreground/30";

export const tone = {
  success: "text-green-700 dark:text-green-400",
  info: "text-blue-700 dark:text-blue-400",
  warning: "text-yellow-700 dark:text-yellow-400",
  danger: "text-red-700 dark:text-red-400",
  accent: "text-electric-ink",
  muted: "text-muted-foreground",
} as const;

export type Tone = keyof typeof tone;

const dotTone: Record<Tone, string> = {
  success: "bg-green-600 dark:bg-green-400",
  info: "bg-blue-600 dark:bg-blue-400",
  warning: "bg-yellow-500",
  danger: "bg-red-600 dark:bg-red-400",
  accent: "bg-electric-ink",
  muted: "bg-muted-foreground/60",
};

/** Mono, lowercase status label with a square dot, e.g. `■ active`. */
export function StatusLabel({ status, toneName }: { status: string; toneName: Tone }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 font-mono text-xs", tone[toneName])}>
      <span className={cn("size-1.5 shrink-0", dotTone[toneName])} aria-hidden="true" />
      {status}
    </span>
  );
}

export function PlanBadge({ hasPro, className }: { hasPro: boolean; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        hasPro ? "bg-foreground text-background" : "border border-border text-muted-foreground",
        className,
      )}
    >
      {hasPro ? "Pro" : "Free"}
    </span>
  );
}

interface DashboardCardProps {
  title: ReactNode;
  description?: ReactNode;
  /** Mono eyebrow shown above the title, e.g. `projects`. */
  eyebrow?: string;
  action?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  id?: string;
}

export function DashboardCard({
  title,
  description,
  eyebrow,
  action,
  footer,
  children,
  className,
  bodyClassName,
  id,
}: DashboardCardProps) {
  const fallbackId = useId();
  const headingId = id ?? fallbackId;

  return (
    <section
      aria-labelledby={headingId}
      className={cn("flex flex-col border-2 border-border bg-card", className)}
    >
      <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3.5 sm:px-5">
        <div className="min-w-0 space-y-0.5">
          {eyebrow && <p className="font-mono text-[11px] text-electric-ink">{eyebrow}</p>}
          <h2
            id={headingId}
            className="truncate font-[family-name:var(--font-heading)] text-base font-semibold text-foreground"
          >
            {title}
          </h2>
          {description && (
            <p className="text-xs text-muted-foreground text-pretty sm:text-sm">{description}</p>
          )}
        </div>
        {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
      </header>
      <div className={cn("flex-1 p-4 sm:p-5", bodyClassName)}>{children}</div>
      {footer && (
        <footer className="border-t border-border bg-muted/20 px-4 py-2.5 text-xs text-muted-foreground sm:px-5">
          {footer}
        </footer>
      )}
    </section>
  );
}

export function CardSkeleton({ label, rows = 3 }: { label: string; rows?: number }) {
  return (
    <div className="border-2 border-border bg-card" aria-busy="true">
      <span className="sr-only">Loading {label}…</span>
      <div aria-hidden="true" className="animate-pulse motion-reduce:animate-none">
        <div className="space-y-2 border-b border-border px-4 py-3.5 sm:px-5">
          <div className="h-2.5 w-16 bg-muted" />
          <div className="h-4 w-32 bg-muted" />
        </div>
        <div className="space-y-2.5 p-4 sm:p-5">
          {Array.from({ length: rows }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton rows never reorder
            <div key={i} className="h-10 w-full bg-muted/70" />
          ))}
        </div>
      </div>
    </div>
  );
}

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ icon: Icon, title, children, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center px-2 py-8 text-center">
      <div className="mb-3 flex size-10 items-center justify-center border-2 border-dashed border-border">
        <Icon className="size-4 text-foreground/40" aria-hidden="true" />
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {children && (
        <div className="mt-1 max-w-xs text-xs text-muted-foreground text-pretty">{children}</div>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

interface CopyButtonProps {
  value: string;
  label: string;
  className?: string;
  children?: ReactNode;
}

/** Icon button (or labelled button when `children` is set) that copies `value`. */
export function CopyButton({ value, label, className, children }: CopyButtonProps) {
  const { state, copy } = useCopyToClipboard();
  const Icon = state === "copied" ? Check : state === "failed" ? X : Copy;

  return (
    <button
      type="button"
      onClick={() => void copy(value)}
      aria-label={label}
      title={state === "failed" ? "Couldn't copy" : label}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground",
        focusRing,
        className,
      )}
    >
      {children}
      <Icon
        className={cn(
          "size-3.5",
          state === "copied" && tone.success,
          state === "failed" && tone.danger,
        )}
        aria-hidden="true"
      />
      <span className="sr-only" aria-live="polite">
        {state === "copied" && "Copied"}
        {state === "failed" && "Couldn't copy"}
      </span>
    </button>
  );
}

/** A copyable `$ command` line in the style of the install widget. */
export function CommandLine({ command, className }: { command: string; className?: string }) {
  return (
    <div
      className={cn(
        "group flex items-center gap-2 border border-border bg-muted/20 px-3 py-2 transition-colors hover:border-foreground/30",
        className,
      )}
    >
      <span className="select-none font-mono text-xs text-muted-foreground" aria-hidden="true">
        $
      </span>
      <code
        className={`min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-xs text-foreground scrollbar-none`}
      >
        {command}
      </code>
      <CopyButton value={command} label={`Copy command: ${command}`} className="p-1" />
    </div>
  );
}

interface MeterProps {
  label: string;
  used: number;
  limit: number;
  /** Shown instead of `used / limit`, e.g. "Unlimited". */
  valueLabel?: string;
}

export function Meter({ label, used, limit, valueLabel }: MeterProps) {
  const percent = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
  const isOver = limit > 0 && used > limit;
  const isFull = limit > 0 && used >= limit;

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="text-foreground/70">{label}</span>
        <span
          className={cn(
            "font-mono tabular-nums",
            isOver ? tone.warning : isFull ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {valueLabel ?? `${used} / ${limit}`}
        </span>
      </div>
      <div
        className="h-1 w-full bg-border"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={Math.min(used, limit)}
      >
        <div
          className={cn(
            "h-full transition-[width] duration-500",
            isOver ? "bg-yellow-500" : "bg-foreground",
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

interface SegmentedTabsProps<T extends string> {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<{ value: T; label: string; count?: number }>;
}

/** Compact filter tabs used above dashboard lists. */
export function SegmentedTabs<T extends string>({
  label,
  value,
  onChange,
  options,
}: SegmentedTabsProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`-mx-1 flex gap-1 overflow-x-auto px-1 scrollbar-none`}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 border px-2.5 py-1 text-xs transition-colors",
              focusRing,
              selected
                ? "border-foreground bg-foreground text-background"
                : "border-border text-foreground/70 hover:border-foreground/50 hover:text-foreground",
            )}
          >
            {option.label}
            {option.count !== undefined && (
              <span
                className={cn(
                  "font-mono tabular-nums",
                  selected ? "text-background/70" : "text-muted-foreground",
                )}
              >
                {option.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
