"use client";

import { cn } from "@repo/ui/lib/utils";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { SectionWrapper } from "./section-wrapper";

const installMethods = [
  { name: "bun", command: "bun install -g relic" },
  { name: "curl", command: "curl -fsSL https://relic.so/install | bash" },
  { name: "npm", command: "npm install -g @relic/cli" },
  { name: "brew", command: "brew install relic" },
  { name: "cargo", command: "cargo install relic" },
];

export function InstallSection() {
  const defaultMethod = { name: "bun", command: "bun install -g @relic/cli" };
  const [activeMethod, setActiveMethod] = useState(installMethods[0] ?? defaultMethod);
  const [copied, setCopied] = useState(false);

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(activeMethod.command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <SectionWrapper label="Install">
      <div className="mx-auto max-w-6xl px-6 py-16 lg:px-12">
        <div className="overflow-hidden border-2 border-border bg-card">
          <div
            className="flex border-b-2 border-border"
            role="tablist"
            aria-label="Installation methods"
          >
            {installMethods.map((method) => (
              <button
                type="button"
                key={method.name}
                onClick={() => setActiveMethod(method)}
                role="tab"
                aria-selected={activeMethod.name === method.name}
                aria-controls={`install-panel-${method.name}`}
                className={cn(
                  "px-6 py-3 font-mono text-xs uppercase tracking-wider transition-all focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring border-r-2 border-border",
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
            className="flex items-center gap-4 bg-background px-6 py-4"
            role="tabpanel"
            id={`install-panel-${activeMethod.name}`}
          >
            <code className="font-mono text-sm text-foreground">{activeMethod.command}</code>
            <button
              type="button"
              onClick={copyToClipboard}
              aria-label={copied ? "Copied to clipboard" : "Copy installation command"}
              className="p-2 text-foreground/70 transition-all hover:bg-foreground hover:text-background focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring border-2 border-border hover:border-foreground"
            >
              {copied ? (
                <Check className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Copy className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </div>
    </SectionWrapper>
  );
}
