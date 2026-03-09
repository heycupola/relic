import Link from "next/link";

interface EmptyStateAction {
  href: string;
  label: string;
  external?: boolean;
}

interface ContentEmptyStateProps {
  eyebrow: string;
  title: string;
  description: string;
  hint: string;
  actions?: EmptyStateAction[];
}

export function ContentEmptyState({
  eyebrow,
  title,
  description,
  hint,
  actions = [],
}: ContentEmptyStateProps) {
  return (
    <div className="overflow-hidden border-2 border-border bg-card">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_240px]">
        <div className="space-y-6 p-5 sm:p-8">
          <div className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
            {eyebrow}
          </div>
          <div className="space-y-3">
            <h2 className="max-w-2xl text-2xl font-semibold tracking-tight text-balance text-foreground sm:text-3xl">
              {title}
            </h2>
            <p className="max-w-2xl text-sm leading-relaxed text-foreground/65 sm:text-base">
              {description}
            </p>
          </div>
          {actions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {actions.map((action) => (
                <Link
                  key={action.href}
                  href={action.href}
                  target={action.external ? "_blank" : undefined}
                  rel={action.external ? "noopener noreferrer" : undefined}
                  className="border border-border px-3 py-2 text-sm text-foreground/80 transition-colors hover:bg-foreground hover:text-background"
                >
                  {action.label}
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="border-t-2 border-border bg-muted/40 p-5 sm:p-8 lg:border-l-2 lg:border-t-0">
          <div className="flex min-h-36 flex-col justify-between">
            <div className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
              Status
            </div>
            <div className="space-y-3">
              <div className="text-4xl font-semibold tracking-tight text-foreground">00</div>
              <p className="max-w-[16rem] text-sm leading-relaxed text-foreground/60">{hint}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
