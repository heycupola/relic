import type { ReactNode } from "react";

interface GridContainerProps {
  children: ReactNode;
}

export function GridContainer({ children }: GridContainerProps) {
  return (
    <div className="relative min-h-screen grid grid-cols-12">
      <div className="absolute left-0 top-0 bottom-0 w-px bg-border" />
      <div className="absolute right-0 top-0 bottom-0 w-px bg-border" />

      <div className="col-start-5 col-span-4 relative flex flex-col">
        <div className="absolute left-0 top-0 bottom-0 w-px bg-border" />
        <div className="absolute right-0 top-0 bottom-0 w-px bg-border" />

        {children}
      </div>
    </div>
  );
}

interface SectionProps {
  children: ReactNode;
  className?: string;
}

export function Section({ children, className = "" }: SectionProps) {
  return (
    <div className={`relative border-t border-dashed border-border ${className}`}>{children}</div>
  );
}
