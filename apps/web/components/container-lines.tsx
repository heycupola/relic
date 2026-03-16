"use client";

import { useEffect, useState } from "react";

export function ContainerLines() {
  const [containerLeft, setContainerLeft] = useState(0);
  const [containerRight, setContainerRight] = useState(0);

  useEffect(() => {
    const calculatePositions = () => {
      // max-w-5xl = 1024px, with px-6 (24px) or lg:px-12 (48px)
      const maxWidth = 1024;
      const windowWidth = window.innerWidth;

      // Calculate actual container width (capped at maxWidth)
      const containerWidth = Math.min(windowWidth, maxWidth);
      // Calculate how far the container is from the left edge (centered when smaller than viewport)
      const containerOffset = (windowWidth - containerWidth) / 2;

      // Position lines at the container edges (before padding, so padding creates space)
      setContainerLeft(containerOffset);
      setContainerRight(containerOffset);
    };

    calculatePositions();
    window.addEventListener("resize", calculatePositions);
    return () => window.removeEventListener("resize", calculatePositions);
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 z-[60]" aria-hidden="true">
      {/* Left vertical line */}
      <div className="absolute top-0 bottom-0 w-px bg-border" style={{ left: containerLeft }} />
      {/* Right vertical line */}
      <div className="absolute top-0 bottom-0 w-px bg-border" style={{ right: containerRight }} />
    </div>
  );
}
