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
  label: _label,
  id,
  className,
  showStripes: _showStripes = false,
}: SectionWrapperProps) {
  return (
    <section id={id} className={cn("relative", className)}>
      <div className="border-b border-border">{children}</div>
    </section>
  );
}
