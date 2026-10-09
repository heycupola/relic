import { cn } from "@repo/ui/lib/utils";
import { Check, ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import { InstallSection } from "@/components/install-section";
import { SITE_DOCS_URL } from "@/lib/site";
import { focusRing } from "@/lib/styles";
import { CommandLine, DashboardCard } from "./primitives";

interface Step {
  title: string;
  description: ReactNode;
  content?: ReactNode;
  done?: boolean;
}

const STEPS: Step[] = [
  {
    title: "Create your account",
    description: "You're signed in. Your encryption keys never leave your devices.",
    done: true,
  },
  {
    title: "Install the CLI",
    description: "Pick the package manager you already use.",
    content: <InstallSection showWrapper={false} compact />,
  },
  {
    title: "Sign in and create a project",
    description: (
      <>
        After signing in, run <code className="font-mono text-foreground">relic</code> to open the
        TUI. Create a project there and paste your <code className="font-mono">.env</code>.
      </>
    ),
    content: <CommandLine command="relic login" />,
  },
  {
    title: "Link your repo and run",
    description: "Inject secrets as environment variables. Nothing is written to disk.",
    content: (
      <div className="space-y-2">
        <CommandLine command="relic init" />
        <CommandLine command="relic run -e development -- npm run dev" />
      </div>
    ),
  },
];

export function GetStartedCard() {
  const completed = STEPS.filter((s) => s.done).length;

  return (
    <DashboardCard
      eyebrow="get started"
      title="Set up Relic in about two minutes"
      description="Follow these steps from your terminal. This page updates as soon as your first project exists."
      action={
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {completed}/{STEPS.length}
        </span>
      }
      footer={
        <a
          href={SITE_DOCS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={`inline-flex items-center gap-1.5 transition-colors hover:text-foreground ${focusRing}`}
        >
          Read the full quickstart
          <ExternalLink className="size-3" aria-hidden="true" />
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      }
    >
      <ol className="space-y-0">
        {STEPS.map((step, index) => {
          const isLast = index === STEPS.length - 1;
          return (
            <li key={step.title} className="relative flex gap-4">
              {!isLast && (
                <span
                  className="absolute top-8 bottom-0 left-[13px] w-px bg-border"
                  aria-hidden="true"
                />
              )}
              <span
                className={cn(
                  "relative z-10 flex size-7 shrink-0 items-center justify-center border-2 font-mono text-xs",
                  step.done
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-card text-foreground/70",
                )}
                aria-hidden="true"
              >
                {step.done ? <Check className="size-3.5" /> : index + 1}
              </span>
              <div className={cn("min-w-0 flex-1 space-y-2.5", !isLast && "pb-6")}>
                <div className="space-y-0.5 pt-1">
                  <h3
                    className={cn(
                      "text-sm font-medium",
                      step.done ? "text-muted-foreground" : "text-foreground",
                    )}
                  >
                    {step.title}
                    {step.done && <span className="sr-only"> (done)</span>}
                  </h3>
                  <p className="text-xs text-muted-foreground text-pretty">{step.description}</p>
                </div>
                {step.content}
              </div>
            </li>
          );
        })}
      </ol>
    </DashboardCard>
  );
}
