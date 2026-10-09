import type { ReactNode } from "react";

interface PageHeaderProps {
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}

export function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 space-y-1.5">
        <p className="font-mono text-xs text-foreground/60">{eyebrow}</p>
        <h1 className="font-[family-name:var(--font-heading)] text-2xl font-semibold tracking-tight text-balance text-foreground sm:text-3xl">
          {title}
        </h1>
        {description && <div className="text-sm text-foreground/60 text-pretty">{description}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
