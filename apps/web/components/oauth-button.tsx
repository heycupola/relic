"use client";

import { cn } from "@repo/ui/lib/utils";
import type { ReactNode } from "react";

interface OAuthButtonProps {
  provider: "google" | "github";
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}

const providerStyles = {
  google: {
    base: "bg-white text-[#1f1f1f] border-[#dadce0] hover:bg-[#f8f9fa] hover:border-[#dadce0] hover:shadow-sm",
  },
  github: {
    base: "bg-[#24292e] text-white border-[#24292e] hover:bg-[#2f363d] hover:border-[#2f363d]",
  },
};

export function OAuthButton({ provider, icon, onClick, disabled, children }: OAuthButtonProps) {
  const styles = providerStyles[provider];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center justify-center gap-3 w-full h-12 rounded-md border text-base font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed",
        styles.base,
      )}
    >
      {icon}
      {children}
    </button>
  );
}
