"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { focusRing } from "@/lib/styles";
import { SectionWrapper } from "./section-wrapper";

export function AppPreview() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    video.play().catch(() => {
      // Autoplay can be blocked; the play button stays available.
    });
  }, []);

  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  };

  return (
    <SectionWrapper label="Preview">
      <div className="mx-auto max-w-5xl px-4 sm:px-0">
        <div className="relative aspect-video w-full bg-muted">
          <video
            ref={videoRef}
            src="/videos/demo.mp4"
            muted
            loop
            playsInline
            preload="metadata"
            aria-label="Relic product demo"
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            className="h-full w-full object-cover"
          />
          <button
            type="button"
            onClick={togglePlayback}
            aria-label={isPlaying ? "Pause demo video" : "Play demo video"}
            className={`absolute bottom-3 right-3 inline-flex h-9 w-9 items-center justify-center border-2 border-border bg-background/90 text-foreground backdrop-blur-sm transition-colors hover:bg-background ${focusRing}`}
          >
            {isPlaying ? (
              <Pause className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Play className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
    </SectionWrapper>
  );
}
