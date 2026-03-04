import { cn } from "@repo/ui/lib/utils";
import type React from "react";

interface SectionWrapperProps {
  children: React.ReactNode;
  label: string;
  id?: string;
  className?: string;
  showStripes?: boolean;
}

export function SectionWrapper({
  children,
  label,
  id,
  className,
  showStripes = false,
}: SectionWrapperProps) {
  return (
    <section id={id} aria-label={label} className={cn("relative", className)}>
      {showStripes && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(135deg, currentColor 0px, currentColor 1px, transparent 1px, transparent 12px)",
          }}
        />
      )}
      <div className="relative border-b border-border">{children}</div>
    </section>
  );
}
