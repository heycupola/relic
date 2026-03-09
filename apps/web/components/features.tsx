"use client";

import { useRef } from "react";
import { SectionWrapper } from "./section-wrapper";

interface VideoFeature {
  title: string;
  badge: "Free" | "Pro";
  description: string;
  videoSrc: string;
}

interface CompactFeature {
  keyword: string;
  title: string;
  description: string;
}

const videoFeatures: VideoFeature[] = [
  {
    title: "Built-in Secret Editor",
    badge: "Free",
    description: "Paste your .env file or edit secrets directly in the TUI. No context switching.",
    videoSrc: "/videos/demo.mp4",
  },
  {
    title: "Collaboration",
    badge: "Pro",
    description:
      "Share projects with your team via email. Each person gets their own encryption keys.",
    videoSrc: "/videos/demo.mp4",
  },
  {
    title: "Run Anywhere",
    badge: "Free",
    description:
      "Inject secrets into any process with API keys. Works in GitHub Actions, GitLab CI, and more.",
    videoSrc: "/videos/demo.mp4",
  },
];

const compactFeatures: CompactFeature[] = [
  {
    keyword: "run",
    title: "Language Agnostic",
    description: "Any language, any framework. Secrets are injected as environment variables.",
  },
  {
    keyword: "init",
    title: "Quick Setup",
    description:
      "Run relic init to connect your project, then relic run to inject your secrets. Ready in seconds.",
  },
  {
    keyword: "organize",
    title: "Projects, Envs, Folders",
    description:
      "A clean hierarchy to keep your secrets structured, from project level down to individual folders.",
  },
  {
    keyword: "encrypt",
    title: "Encrypted by Default",
    description:
      "AES-256 + Argon2id. Your secrets are encrypted before they ever leave your machine.",
  },
];

function VideoCard({ feature }: { feature: VideoFeature }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  const playVideo = async () => {
    const video = videoRef.current;
    if (!video) return;

    try {
      await video.play();
    } catch {
      // Ignore autoplay blocking edge cases on unsupported browsers.
    }
  };

  const resetVideo = () => {
    const video = videoRef.current;
    if (!video) return;

    video.pause();
    video.currentTime = 0;
  };

  return (
    <div className="border-2 border-border bg-card flex flex-col hover:border-foreground/30 transition-colors">
      <div className="p-4 flex-1 sm:p-5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold text-foreground">{feature.title}</h3>
          <span
            className={
              feature.badge === "Pro"
                ? "px-2 py-0.5 text-[10px] font-bold uppercase bg-foreground text-background"
                : "px-2 py-0.5 text-[10px] font-bold uppercase border border-border text-foreground/50"
            }
          >
            {feature.badge}
          </span>
        </div>
        <p className="mt-2 text-sm text-foreground/60 text-pretty">{feature.description}</p>
      </div>
      <button
        type="button"
        className="group relative w-full border-t-2 border-border bg-muted/20"
        aria-label={`${feature.title} preview. Hover or focus to play.`}
        onMouseEnter={playVideo}
        onMouseLeave={resetVideo}
        onFocus={playVideo}
        onBlur={resetVideo}
      >
        <video
          ref={videoRef}
          src={feature.videoSrc}
          title={feature.title}
          muted
          playsInline
          preload="metadata"
          className="w-full aspect-video object-cover"
        />
        <span className="pointer-events-none absolute bottom-3 right-3 border border-white/15 bg-black/75 px-2 py-1 text-[11px] font-medium text-white/80 backdrop-blur-sm transition-colors group-hover:border-white/25 group-hover:text-white">
          Hover to play
        </span>
      </button>
    </div>
  );
}

function CompactCard({ feature }: { feature: CompactFeature }) {
  return (
    <div className="border-2 border-border bg-card p-4 hover:border-foreground/30 transition-colors sm:p-5">
      <span className="font-mono text-xs text-electric-ink">{feature.keyword}</span>
      <h3 className="mt-1.5 font-semibold text-foreground text-sm">{feature.title}</h3>
      <p className="mt-2 text-sm text-foreground/60 text-pretty">{feature.description}</p>
    </div>
  );
}

export function Features() {
  return (
    <SectionWrapper label="Features" id="features">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:px-12">
        <h2 className="text-xl font-semibold text-foreground sm:text-2xl">Features</h2>
        <p className="mt-2 max-w-2xl text-sm text-foreground/60 text-pretty sm:text-base">
          Everything you need to manage secrets, from editing to sharing to deployment.
        </p>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:mt-8 sm:gap-4 md:grid-cols-2 lg:grid-cols-3">
          {videoFeatures.map((feature) => (
            <VideoCard key={feature.title} feature={feature} />
          ))}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 sm:mt-4 sm:gap-4 lg:grid-cols-4">
          {compactFeatures.map((feature) => (
            <CompactCard key={feature.keyword} feature={feature} />
          ))}
        </div>
      </div>
    </SectionWrapper>
  );
}
