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

const providerStyles = {
  google: {
    base: "bg-white text-[#1f1f1f] border-[#dadce0] hover:bg-[#f8f9fa] hover:border-[#dadce0] hover:shadow-sm",
    badge: "bg-[#f1f3f4] text-[#5f6368]",
  },
  github: {
    base: "bg-[#24292e] text-white border-[#24292e] hover:bg-[#2f363d] hover:border-[#2f363d]",
    badge: "bg-[#3b434b] text-[#8b949e]",
  },
};

export function OAuthButton({
  provider,
  icon,
  onClick,
  disabled,
  lastUsed,
  children,
}: OAuthButtonProps) {
  const styles = providerStyles[provider];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "relative inline-flex items-center justify-center gap-3 w-full h-12 rounded-md border text-base font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed",
        styles.base,
      )}
    >
      {icon}
      {children}
      {lastUsed && (
        <span
          className={cn(
            "absolute right-3 text-[10px] font-normal px-1.5 py-0.5 rounded",
            styles.badge,
          )}
        >
          last used
        </span>
      )}
    </button>
  );
}
