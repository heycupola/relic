import Link from "next/link";
import { focusRing } from "@/lib/styles";

interface EmptyStateAction {
  href: string;
  label: string;
  external?: boolean;
}

interface ContentEmptyStateProps {
  title: string;
  description: string;
  actions?: EmptyStateAction[];
}

export function ContentEmptyState({ title, description, actions = [] }: ContentEmptyStateProps) {
  return (
    <div className="border-2 border-dashed border-border px-5 py-12 text-center sm:px-8 sm:py-16">
      <h2 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-foreground/60 text-pretty">
        {description}
      </p>
      {actions.length > 0 && (
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {actions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              target={action.external ? "_blank" : undefined}
              rel={action.external ? "noopener noreferrer" : undefined}
              className={`border-2 border-border px-3.5 py-2 text-sm font-medium text-foreground transition-colors hover:border-foreground/40 hover:bg-muted/50 ${focusRing}`}
            >
              {action.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
