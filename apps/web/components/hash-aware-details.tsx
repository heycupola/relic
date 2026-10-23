"use client";

import type React from "react";
import { useEffect, useRef } from "react";

interface HashAwareDetailsProps {
  className?: string;
  summary: React.ReactNode;
  children: React.ReactNode;
}

/** A `<details>` that opens itself when the URL hash points at an element inside it. */
export function HashAwareDetails({ className, summary, children }: HashAwareDetailsProps) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const openForHash = () => {
      const details = ref.current;
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!details || !id) return;
      const target = document.getElementById(id);
      if (!target || !details.contains(target) || details.open) return;
      details.open = true;
      requestAnimationFrame(() => target.scrollIntoView());
    };

    openForHash();
    window.addEventListener("hashchange", openForHash);
    return () => window.removeEventListener("hashchange", openForHash);
  }, []);

  return (
    // Browsers may open the element during fragment navigation before hydration.
    <details ref={ref} className={className} suppressHydrationWarning>
      {summary}
      {children}
    </details>
  );
}
