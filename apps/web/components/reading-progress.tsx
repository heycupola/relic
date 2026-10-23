"use client";

import { useEffect, useRef } from "react";

const HEADER_OFFSET_PX = 64;

export function ReadingProgress({ targetId }: { targetId: string }) {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = document.getElementById(targetId);
    const bar = barRef.current;
    if (!target || !bar) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      const start = target.getBoundingClientRect().top + window.scrollY - HEADER_OFFSET_PX;
      const distance = target.offsetHeight - window.innerHeight + HEADER_OFFSET_PX;
      const progress = distance > 0 ? (window.scrollY - start) / distance : 1;
      bar.style.transform = `scaleX(${Math.min(1, Math.max(0, progress))})`;
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
  }, [targetId]);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-14 z-50 h-0.5 sm:top-16"
    >
      <div
        ref={barRef}
        className="h-full origin-left bg-foreground"
        style={{ transform: "scaleX(0)" }}
      />
    </div>
  );
}
