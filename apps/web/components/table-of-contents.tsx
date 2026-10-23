"use client";

import { cn } from "@repo/ui/lib/utils";
import { useEffect, useState } from "react";
import type { MdxHeading } from "@/lib/mdx";

const ACTIVE_OFFSET_PX = 120;

export function TableOfContents({ headings }: { headings: MdxHeading[] }) {
  const [activeId, setActiveId] = useState<string | undefined>(headings[0]?.id);

  useEffect(() => {
    const elements = headings
      .map((heading) => document.getElementById(heading.id))
      .filter((element): element is HTMLElement => element !== null);
    if (elements.length === 0) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      let current = elements[0]!.id;
      for (const element of elements) {
        if (element.getBoundingClientRect().top - ACTIVE_OFFSET_PX > 0) break;
        current = element.id;
      }
      const atBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      setActiveId(atBottom ? elements[elements.length - 1]!.id : current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [headings]);

  if (headings.length === 0) return null;

  return (
    <nav aria-label="On this page">
      <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
        On this page
      </p>
      <ol className="space-y-px border-l-2 border-border">
        {headings.map((heading) => {
          const isActive = heading.id === activeId;
          return (
            <li key={heading.id}>
              <a
                href={`#${heading.id}`}
                aria-current={isActive ? "location" : undefined}
                className={cn(
                  "-ml-0.5 block border-l-2 py-1.5 pr-2 text-[13px] leading-snug transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground",
                  heading.level === 3 ? "pl-6" : "pl-3",
                  isActive
                    ? "border-foreground font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {heading.text}
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
