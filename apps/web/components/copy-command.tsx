"use client";

import { Check, Copy } from "lucide-react";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import { focusRing } from "@/lib/styles";

export function CopyCommand({ command }: { command: string }) {
  const { state, copy } = useCopyToClipboard();

  return (
    <div className="flex min-w-0 items-center gap-2 border-2 border-border bg-muted/30 py-1 pl-3 pr-1">
      <code className="min-w-0 overflow-x-auto whitespace-nowrap font-mono text-sm text-foreground scrollbar-none">
        <span aria-hidden="true" className="mr-2 select-none text-muted-foreground">
          $
        </span>
        {command}
      </code>
      <button
        type="button"
        onClick={() => copy(command)}
        aria-label={state === "copied" ? "Copied to clipboard" : `Copy "${command}"`}
        className={`inline-flex shrink-0 items-center p-1.5 text-foreground/70 transition-colors hover:bg-foreground hover:text-background ${focusRing}`}
      >
        {state === "copied" ? (
          <Check className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Copy className="h-4 w-4" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
