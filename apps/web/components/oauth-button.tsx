"use client";

import { cn } from "@repo/ui/lib/utils";
import type { ReactNode } from "react";

interface OAuthButtonProps {
  provider: "google" | "github";
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  lastUsed?: boolean;
  children: ReactNode;
}

export function OAuthButton({
  provider: _provider,
  icon,
  onClick,
  disabled,
  lastUsed,
  children,
}: OAuthButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "relative grid w-full py-3 border-2 border-border bg-background text-foreground font-medium transition-colors hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed",
      )}
    >
      <span className="col-start-1 row-start-1 inline-flex items-center justify-center gap-3">
        {icon}
        {children}
      </span>
      {lastUsed && (
        <span className="col-start-1 row-start-1 flex items-center justify-end pr-3">
          <span className="text-[10px] font-mono font-normal px-1.5 py-0.5 border border-border text-foreground/50">
            last used
          </span>
        </span>
      )}
    </button>
  );
}
