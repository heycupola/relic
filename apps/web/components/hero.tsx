"use client";

import { Button } from "@repo/ui/components/button";
import { ArrowRight, Star } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { SectionWrapper } from "./section-wrapper";

function formatStars(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K+`;
  }
  return count.toLocaleString();
}

export function Hero() {
  const [stars, setStars] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/github-stars")
      .then((res) => res.json())
      .then((data) => setStars(data.stars))
      .catch((error) => {
        console.debug("Failed to fetch GitHub stars", error);
      });
  }, []);

  return (
    <SectionWrapper label="Introduction">
      <div className="mx-auto max-w-6xl px-6 py-16 md:py-20 lg:px-12">
        {/* <p className="mb-4 font-mono text-sm text-foreground/50">{"What's new in v1.0.0"}</p> */}
        <p className="mb-4 font-mono text-sm text-foreground/50">{"Closed beta now open!"}</p>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance text-foreground md:text-5xl lg:text-6xl">
          The secrets layer developers actually trust
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-foreground/60 text-pretty">
          Manage and share secrets. Encrypted on your device, never exposed to anyone else. Not even
          us.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Button
            asChild
            className="gap-2 rounded-none border-2 border-border bg-foreground text-background hover:bg-foreground/90 px-6 py-2.5 h-auto font-medium"
          >
            <Link href="/docs">
              Get Started <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>

          <Button
            asChild
            variant="ghost"
            className="group gap-2 rounded-none border-2 border-border bg-background text-foreground hover:bg-muted/50 px-6 py-2.5 h-auto font-medium"
          >
            <Link
              href="https://github.com/heycupola/relic"
              target="_blank"
              rel="noopener noreferrer"
            >
              <div className="flex items-center gap-2">
                <svg className="h-5 w-5" aria-hidden="true" fill="currentColor" viewBox="0 0 16 16">
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                </svg>
                <span>Star on GitHub</span>
              </div>

              {stars !== null && (
                <>
                  <div className="h-5 w-px bg-border" aria-hidden="true" />

                  <div className="flex items-center gap-1.5 text-muted-foreground group-hover:text-foreground transition-colors">
                    <Star className="h-4 w-4 fill-current" aria-hidden="true" />
                    <span className="font-mono text-sm tabular-nums">{formatStars(stars)}</span>
                  </div>
                </>
              )}
            </Link>
          </Button>
        </div>
      </div>
    </SectionWrapper>
  );
}
