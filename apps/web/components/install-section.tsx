"use client";

import { cn } from "@repo/ui/lib/utils";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { SectionWrapper } from "./section-wrapper";

type InstallMethod = {
  name: string;
  command: string;
};

const installMethods: InstallMethod[] = [
  { name: "curl", command: "curl -fsSL https://relic.so/install | bash" },
  { name: "brew", command: "brew install heycupola/tap/relic" },
  { name: "npm", command: "npm install -g relic" },
  { name: "bun", command: "bun add -g relic" },
];

interface InstallSectionProps {
  showWrapper?: boolean;
  compact?: boolean;
}

export function InstallSection({ showWrapper = true, compact = false }: InstallSectionProps) {
  const [activeMethod, setActiveMethod] = useState<InstallMethod>(installMethods[0]!);
  const [copied, setCopied] = useState(false);

  const copyToClipboard = async () => {
    try {
      if (!navigator.clipboard) {
        // Fallback for older browsers or insecure contexts
        const textArea = document.createElement("textarea");
        textArea.value = activeMethod.command;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      } else {
        await navigator.clipboard.writeText(activeMethod.command);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
      // Could show a toast/alert here in production
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, currentIndex: number) => {
    let newIndex = currentIndex;

    if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      newIndex = currentIndex > 0 ? currentIndex - 1 : installMethods.length - 1;
    } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      newIndex = currentIndex < installMethods.length - 1 ? currentIndex + 1 : 0;
    } else if (e.key === "Home") {
      e.preventDefault();
      newIndex = 0;
    } else if (e.key === "End") {
      e.preventDefault();
      newIndex = installMethods.length - 1;
    } else {
      return;
    }

    setActiveMethod(installMethods[newIndex]!);
  };

  const installContent = (
    <div className={cn("overflow-hidden border-2 border-border bg-card", compact && "border")}>
      <div
        className={cn("grid grid-cols-4 border-b-2 border-border sm:flex", compact && "border-b")}
        role="tablist"
        aria-label="Installation methods"
      >
        {installMethods.map((method, index) => (
          <button
            type="button"
            key={method.name}
            id={`install-tab-${method.name}`}
            onClick={() => setActiveMethod(method)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            role="tab"
            aria-selected={activeMethod.name === method.name}
            aria-controls={`install-panel-${method.name}`}
            tabIndex={activeMethod.name === method.name ? 0 : -1}
            className={cn(
              "font-mono text-xs uppercase transition-all focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring border-r-2 border-border last:border-r-0 sm:last:border-r-2",
              compact ? "py-2 sm:px-4 sm:py-2" : "py-3 sm:px-6 sm:py-3",
              activeMethod.name === method.name
                ? "bg-foreground text-background font-bold"
                : "text-foreground/60 hover:text-foreground hover:bg-muted",
            )}
          >
            {method.name}
          </button>
        ))}
      </div>
      <div
        className={cn("bg-muted/20 overflow-x-auto", compact ? "px-3 py-2.5" : "px-4 py-4 sm:px-6")}
        role="tabpanel"
        id={`install-panel-${activeMethod.name}`}
        aria-labelledby={`install-tab-${activeMethod.name}`}
      >
        <div className="flex items-center gap-2">
          <code
            className={cn(
              "font-mono text-foreground whitespace-nowrap",
              compact ? "text-xs" : "text-sm",
            )}
          >
            {activeMethod.command}
          </code>
          <button
            type="button"
            onClick={copyToClipboard}
            aria-label={copied ? "Copied to clipboard" : "Copy installation command"}
            className="inline-flex shrink-0 items-center p-2 text-foreground/70 transition-all hover:bg-foreground hover:text-background focus-visible:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring rounded sm:p-1.5"
          >
            {copied ? (
              <Check className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Copy className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>
        <output className="sr-only" aria-live="polite" aria-atomic="true">
          {copied ? "Installation command copied to clipboard" : ""}
        </output>
      </div>
    </div>
  );

  if (!showWrapper) {
    return installContent;
  }

  return (
    <SectionWrapper label="Install" showStripes>
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16 lg:px-12">{installContent}</div>
    </SectionWrapper>
  );
}
