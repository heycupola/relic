"use client";

import { cn } from "@repo/ui/lib/utils";
import {
  ArrowUpDown,
  FolderPlus,
  FolderTree,
  HelpCircle,
  KeyRound,
  Layers,
  type LucideIcon,
  MousePointerClick,
  Terminal,
} from "lucide-react";
import { useState } from "react";
import { SectionWrapper } from "./section-wrapper";

interface Step {
  step: string;
  title: string;
  description: string;
  command: string;
  icon: LucideIcon;
}

const cliSteps: Step[] = [
  {
    step: "01",
    title: "Create a Project",
    description: "Initialize a new project to organize related secrets together.",
    command: "relic project create my-app",
    icon: FolderPlus,
  },
  {
    step: "02",
    title: "Add Environments",
    description: "Set up environments like development, staging, and production.",
    command: "relic env create production",
    icon: Layers,
  },
  {
    step: "03",
    title: "Organize with Folders",
    description: "Optionally add folders for backend, frontend, or custom categories.",
    command: "relic folder create backend",
    icon: FolderTree,
  },
  {
    step: "04",
    title: "Store Secrets",
    description: "Add your secrets—they're encrypted client-side before storage.",
    command: "relic secret set DB_URL",
    icon: KeyRound,
  },
];

const tuiSteps: Step[] = [
  {
    step: "01",
    title: "Launch TUI",
    description: "Start the interactive terminal interface for visual management.",
    command: "relic tui",
    icon: Terminal,
  },
  {
    step: "02",
    title: "Navigate Projects",
    description: "Use arrow keys to browse projects and environments visually.",
    command: "↑↓ to navigate",
    icon: ArrowUpDown,
  },
  {
    step: "03",
    title: "Manage Secrets",
    description: "Press Enter to view, edit, or add new secrets interactively.",
    command: "Enter to select",
    icon: MousePointerClick,
  },
  {
    step: "04",
    title: "Quick Actions",
    description: "Use keyboard shortcuts for common operations like copy and delete.",
    command: "? for help",
    icon: HelpCircle,
  },
];

export function HowItWorks() {
  const [activeMode, setActiveMode] = useState<"cli" | "tui">("cli");
  const steps = activeMode === "cli" ? cliSteps : tuiSteps;

  const modes: ("cli" | "tui")[] = ["cli", "tui"];

  const handleKeyDown = (e: React.KeyboardEvent, currentMode: "cli" | "tui") => {
    const currentIndex = modes.indexOf(currentMode);
    let newIndex = currentIndex;

    if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      newIndex = currentIndex > 0 ? currentIndex - 1 : modes.length - 1;
    } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      newIndex = currentIndex < modes.length - 1 ? currentIndex + 1 : 0;
    } else if (e.key === "Home") {
      e.preventDefault();
      newIndex = 0;
    } else if (e.key === "End") {
      e.preventDefault();
      newIndex = modes.length - 1;
    } else {
      return;
    }

    setActiveMode(modes[newIndex] ?? "cli");
  };

  return (
    <SectionWrapper label="Workflow" id="how-it-works" showStripes>
      <div className="mx-auto max-w-6xl px-6 py-20 lg:py-24 lg:px-12">
        <h2 className="text-2xl font-semibold text-foreground">How it works</h2>
        <p className="mt-2 text-foreground/60 text-pretty">Simple hierarchy. Maximum security.</p>

        <div
          className="mt-8 flex border-2 border-border w-fit"
          role="tablist"
          aria-label="Interface type"
        >
          <button
            type="button"
            onClick={() => setActiveMode("cli")}
            onKeyDown={(e) => handleKeyDown(e, "cli")}
            role="tab"
            aria-selected={activeMode === "cli"}
            aria-controls="workflow-content"
            tabIndex={activeMode === "cli" ? 0 : -1}
            className={cn(
              "px-6 py-3 font-mono text-xs uppercase transition-all border-r-2 border-border focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring",
              activeMode === "cli"
                ? "bg-foreground text-background font-bold"
                : "text-foreground/60 hover:text-foreground hover:bg-muted",
            )}
          >
            CLI
          </button>
          <button
            type="button"
            onClick={() => setActiveMode("tui")}
            onKeyDown={(e) => handleKeyDown(e, "tui")}
            role="tab"
            aria-selected={activeMode === "tui"}
            aria-controls="workflow-content"
            tabIndex={activeMode === "tui" ? 0 : -1}
            className={cn(
              "px-6 py-3 font-mono text-xs uppercase transition-all focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring",
              activeMode === "tui"
                ? "bg-foreground text-background font-bold"
                : "text-foreground/60 hover:text-foreground hover:bg-muted",
            )}
          >
            TUI
          </button>
        </div>

        <div
          className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-4"
          id="workflow-content"
          role="tabpanel"
        >
          {steps.map((step, index) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: steps are static
              key={index}
              className="relative border-2 border-border bg-card hover:border-foreground transition-all group flex flex-col"
            >
              <div className="p-6 flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm text-foreground/40 font-medium">
                    {step.step}
                  </span>
                  <step.icon
                    className="h-5 w-5 text-foreground/40 group-hover:text-foreground/70 transition-colors"
                    aria-hidden="true"
                  />
                </div>
                <h3 className="mt-3 font-semibold text-base text-foreground">{step.title}</h3>
                <p className="mt-2 text-sm text-foreground/55 leading-relaxed text-pretty">
                  {step.description}
                </p>
              </div>
              <div className="border-t-2 border-border bg-muted px-4 py-4 group-hover:border-foreground transition-all flex items-center">
                <code className="font-mono text-xs text-foreground">{step.command}</code>
              </div>
            </div>
          ))}
        </div>
      </div>
    </SectionWrapper>
  );
}
