"use client";

import { cn } from "@repo/ui/lib/utils";
import { Check, ExternalLink, X } from "lucide-react";
import { type ReactNode, useState } from "react";
import { InstallSection } from "@/components/install-section";
import { SITE_DOCS_URL } from "@/lib/site";
import { focusRing } from "@/lib/styles";
import { CommandLine, DashboardCard, StatusLabel } from "./primitives";

interface Step {
  keyword: string;
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
      keyword: "account",
      title: "Create your account",
      description: "You're signed in. Your encryption keys never leave your devices.",
      done: true,
    },
    {
      keyword: "install",
      title: "Install the CLI",
      description: "Pick the package manager you already use.",
      content: <InstallSection showWrapper={false} compact />,
      done: hasProject,
    },
    {
      keyword: "login",
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
      keyword: "run",
      title: "Link your repo and run",
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
  const current = Math.max(
    0,
    steps.findIndex((s) => !s.done),
  );
  const [picked, setPicked] = useState<number | null>(null);
  const selected = picked ?? current;
  const step = steps[selected]!;

  return (
    <DashboardCard
      title="Set up Relic in about two minutes"
      description="Follow these steps from your terminal. Each one checks off as your projects and secrets appear."
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
      bodyClassName="grid grid-cols-1 p-0 sm:p-0 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]"
    >
      <ol className="divide-y divide-border border-b border-border md:border-r-2 md:border-b-0">
        {steps.map((s, index) => {
          const isSelected = index === selected;
          return (
            <li key={s.keyword}>
              <button
                type="button"
                onClick={() => setPicked(index)}
                aria-current={isSelected ? "step" : undefined}
                className={cn(
                  "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors sm:px-5",
                  focusRing,
                  isSelected ? "bg-muted/40" : "hover:bg-muted/20",
                )}
              >
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center border-2 font-mono text-[11px]",
                    s.done
                      ? "border-foreground bg-foreground text-background"
                      : index === current
                        ? "border-foreground text-foreground"
                        : "border-border text-muted-foreground",
                  )}
                  aria-hidden="true"
                >
                  {s.done ? <Check className="size-3" /> : index + 1}
                </span>
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-sm",
                    isSelected ? "font-medium text-foreground" : "text-foreground/70",
                  )}
                >
                  {s.title}
                  {s.done && <span className="sr-only"> (done)</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="min-w-0 space-y-3 p-4 sm:p-5" aria-live="polite">
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-foreground">{step.title}</h3>
            {step.done && <StatusLabel status="done" toneName="success" />}
          </div>
          <p className="text-sm text-foreground/60 text-pretty">{step.description}</p>
        </div>
        {step.content}
      </div>
    </DashboardCard>
  );
}
