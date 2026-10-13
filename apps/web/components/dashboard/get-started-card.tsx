import { cn } from "@repo/ui/lib/utils";
import { Check, ExternalLink, X } from "lucide-react";
import type { ReactNode } from "react";
import { InstallSection } from "@/components/install-section";
import { SITE_DOCS_URL } from "@/lib/site";
import { focusRing } from "@/lib/styles";
import { CommandLine, DashboardCard } from "./primitives";

interface Step {
  title: string;
  description: ReactNode;
  content?: ReactNode;
  done: boolean;
}

interface GetStartedCardProps {
  hasProject: boolean;
  hasSecrets: boolean;
  onDismiss: () => void;
}

export function GetStartedCard({ hasProject, hasSecrets, onDismiss }: GetStartedCardProps) {
  // Projects can only be created from the CLI, so an existing project implies it is installed.
  const steps: Step[] = [
    {
      title: "Create your account",
      description: "You're signed in. Your encryption keys never leave your devices.",
      done: true,
    },
    {
      title: "Install the CLI",
      description: "Pick the package manager you already use.",
      content: <InstallSection showWrapper={false} compact />,
      done: hasProject,
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
      done: hasProject,
    },
    {
      title: "Add secrets, link your repo and run",
      description: "Inject secrets as environment variables. Nothing is written to disk.",
      content: (
        <div className="space-y-2">
          <CommandLine command="relic init" />
          <CommandLine command="relic run -e development -- npm run dev" />
        </div>
      ),
      done: hasSecrets,
    },
  ];
  const completed = steps.filter((s) => s.done).length;
  const current = steps.findIndex((s) => !s.done);

  return (
    <DashboardCard
      eyebrow="get started"
      title="Set up Relic in about two minutes"
      description="Follow these steps from your terminal. Steps check off as your projects and secrets appear."
      action={
        <>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {completed}/{steps.length}
          </span>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Hide setup guide"
            title="Hide setup guide"
            className={`p-1 text-muted-foreground transition-colors hover:text-foreground ${focusRing}`}
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        </>
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
      <ol className="grid grid-cols-1 gap-x-8 md:grid-cols-2 md:gap-y-6">
        {steps.map((step, index) => {
          const isLast = index === steps.length - 1;
          return (
            <li key={step.title} className="relative flex gap-4">
              {!isLast && (
                <span
                  className="absolute top-8 bottom-0 left-[13px] w-px bg-border md:hidden"
                  aria-hidden="true"
                />
              )}
              <span
                className={cn(
                  "relative z-10 flex size-7 shrink-0 items-center justify-center border-2 font-mono text-xs",
                  step.done
                    ? "border-foreground bg-foreground text-background"
                    : index === current
                      ? "border-foreground bg-card text-foreground"
                      : "border-border bg-card text-foreground/70",
                )}
                aria-hidden="true"
              >
                {step.done ? <Check className="size-3.5" /> : index + 1}
              </span>
              <div className={cn("min-w-0 flex-1 space-y-2.5", !isLast && "pb-6 md:pb-0")}>
                <div className="space-y-0.5 pt-1">
                  <h3
                    className={cn(
                      "text-sm font-medium",
                      step.done ? "text-muted-foreground line-through" : "text-foreground",
                    )}
                  >
                    {step.title}
                    {step.done && <span className="sr-only"> (done)</span>}
                  </h3>
                  <p className="text-xs text-muted-foreground text-pretty">{step.description}</p>
                </div>
                {!step.done && step.content}
              </div>
            </li>
          );
        })}
      </ol>
    </DashboardCard>
  );
}
