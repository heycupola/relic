"use client";

import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** When false, neither the backdrop nor Escape dismisses the dialog (e.g. while a request is in flight). */
  closeOnBackdrop?: boolean;
  /** Id of the element that names the dialog, usually its heading. */
  labelledBy?: string;
  /** Accessible name to use when there is no visible heading. */
  label?: string;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Dialog({
  open,
  onClose,
  children,
  closeOnBackdrop = true,
  labelledBy,
  label,
}: DialogProps) {
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const fallbackHeadingId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // Read through a ref so toggling dismissibility mid-request doesn't re-run the focus setup.
  const dismissibleRef = useRef(closeOnBackdrop);
  dismissibleRef.current = closeOnBackdrop;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open || !mounted) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const focusables = () => Array.from(panel?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);

    if (panel && !labelledBy && !label) {
      const heading = panel.querySelector<HTMLElement>("h1, h2, h3, h4");
      if (heading) {
        heading.id ||= fallbackHeadingId;
        panel.setAttribute("aria-labelledby", heading.id);
      }
    }

    (focusables()[0] ?? panel)?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (!e.defaultPrevented && dismissibleRef.current) onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !panel) return;

      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = overflow;
      previouslyFocused?.focus?.();
    };
  }, [open, mounted, labelledBy, label, fallbackHeadingId]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div
        className="fixed inset-0 bg-black/50"
        onClick={() => {
          if (dismissibleRef.current) onClose();
        }}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        className="relative z-10 w-full max-w-md border-2 border-border bg-background max-h-[85dvh] overflow-y-auto overscroll-contain outline-none sm:max-h-none sm:overflow-y-visible"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : label}
        tabIndex={-1}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
