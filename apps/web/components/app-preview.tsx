"use client";

import { useEffect, useRef } from "react";
import { SectionWrapper } from "./section-wrapper";

export function AppPreview() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          video.play();
        } else {
          video.pause();
        }
      },
      { threshold: 0.3 },
    );

    observer.observe(video);
    return () => observer.disconnect();
  }, []);

  return (
    <SectionWrapper label="Preview">
      <div className="mx-auto max-w-6xl">
        <div className="aspect-video w-full bg-muted">
          <video
            ref={videoRef}
            src="/videos/app-preview.mp4"
            muted
            loop
            playsInline
            preload="metadata"
            className="h-full w-full object-cover"
          />
        </div>
      </div>
    </SectionWrapper>
  );
}
