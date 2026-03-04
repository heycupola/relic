import { cn } from "@repo/ui/lib/utils";

interface LoadingSpinnerProps {
  size?: "sm" | "md";
  className?: string;
}

export function LoadingSpinner({ size = "sm", className }: LoadingSpinnerProps) {
  const sizeClass = size === "sm" ? "h-3 w-3" : "h-4 w-4";

  return (
    <output
      className={cn(
        sizeClass,
        "border-2 border-foreground/20 border-t-foreground animate-spin",
        className,
      )}
      aria-label="Loading"
      aria-live="polite"
    />
  );
}
