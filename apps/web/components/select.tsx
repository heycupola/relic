"use client";

import { cn } from "@repo/ui/lib/utils";
import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  id?: string;
}

export function Select({ value, onChange, options, placeholder, className, id }: SelectProps) {
  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const handleToggle = () => {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const estimatedHeight = options.length * 36 + 2;
      setOpenUp(spaceBelow < estimatedHeight);
    }
    setOpen(!open);
  };

  const selectedLabel = options.find((o) => o.value === value)?.label ?? placeholder ?? "";

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        ref={buttonRef}
        type="button"
        id={id}
        onClick={handleToggle}
        className="flex items-center justify-between w-full p-2.5 border border-border bg-background text-sm text-foreground hover:border-foreground focus:border-foreground focus:outline-none transition-colors cursor-pointer"
      >
        <span>{selectedLabel}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-foreground/40 transition-transform duration-200",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div
          className={cn(
            "absolute z-10 left-0 right-0 border border-border bg-background",
            openUp ? "bottom-full mb-1" : "top-full mt-1",
          )}
        >
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              className={cn(
                "flex items-center w-full px-3 py-2 text-sm text-left transition-colors",
                value === option.value
                  ? "bg-foreground/5 text-foreground"
                  : "text-foreground/70 hover:bg-muted/50 hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
