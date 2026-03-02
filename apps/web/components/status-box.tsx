import { cn } from "@repo/ui/lib/utils";
import { AlertCircle, CheckCircle, Info, XCircle } from "lucide-react";
import type { ReactNode } from "react";

const variants = {
  info: {
    icon: Info,
    iconClass: "text-foreground/60",
    boxClass: "bg-muted/20",
  },
  warning: {
    icon: AlertCircle,
    iconClass: "text-yellow-500/70",
    boxClass: "bg-yellow-500/5",
  },
  error: {
    icon: XCircle,
    iconClass: "text-red-400/70",
    boxClass: "bg-red-500/5",
  },
  success: {
    icon: CheckCircle,
    iconClass: "text-electric-ink/70",
    boxClass: "bg-electric-ink/5",
  },
} as const;

type Variant = keyof typeof variants;

interface StatusBoxProps {
  variant?: Variant;
  children: ReactNode;
  className?: string;
}

export function StatusBox({ variant = "info", children, className }: StatusBoxProps) {
  const { icon: Icon, iconClass, boxClass } = variants[variant];

  return (
    <div className={cn("border-2 border-border p-4", boxClass, className)}>
      <div className="flex items-start gap-3">
        <Icon className={cn("h-4 w-4 shrink-0 mt-0.5", iconClass)} aria-hidden="true" />
        <div className="text-sm text-foreground/70">{children}</div>
      </div>
    </div>
  );
}
