"use client";

import { ArrowRight, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

interface AnnouncementBarProps {
  text: string;
  href: string;
  storageKey?: string;
  onVisibilityChange?: (visible: boolean) => void;
}

export function AnnouncementBar({
  text,
  href,
  storageKey = "announcement-dismissed",
  onVisibilityChange,
}: AnnouncementBarProps) {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(storageKey);
    const visible = stored !== "true";
    setDismissed(!visible);
    onVisibilityChange?.(visible);
  }, [storageKey, onVisibilityChange]);

  const handleDismiss = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    localStorage.setItem(storageKey, "true");
    setDismissed(true);
    onVisibilityChange?.(false);
  };

  if (dismissed) return null;

  return (
    <div
      className="sticky top-0 z-[65] w-full border-b border-white/20 bg-[#7B5EA7] bg-cover bg-center bg-no-repeat before:absolute before:bottom-full before:left-0 before:right-0 before:h-screen before:bg-[#7B5EA7]"
      style={{ backgroundImage: "url('/announcement-bg.png')" }}
    >
      <div className="mx-auto flex h-9 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-12">
        <Link
          href={href}
          className="flex flex-1 items-center gap-1.5 text-sm font-medium text-white transition-opacity hover:opacity-80"
        >
          {text}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
        <button
          type="button"
          onClick={handleDismiss}
          className="ml-4 flex-shrink-0 rounded-sm p-0.5 text-white/80 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
          aria-label="Dismiss announcement"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
