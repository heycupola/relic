"use client";

import { cn } from "@repo/ui/lib/utils";
import { ChevronDown } from "lucide-react";
import type { SelectHTMLAttributes } from "react";

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  "value" | "onChange" | "children"
> {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
}

export function Select({ value, onChange, options, className, onKeyDown, ...props }: SelectProps) {
  return (
    <div className={cn("relative", className)}>
      <select
        {...props}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          // Escape belongs to the open picker, not to a surrounding dialog.
          if (e.key === "Escape") e.preventDefault();
          onKeyDown?.(e);
        }}
        className="w-full appearance-none p-2.5 pr-9 border border-border bg-background text-sm text-foreground hover:border-foreground focus:border-foreground transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
    </div>
  );
}
