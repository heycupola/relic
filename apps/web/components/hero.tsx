import { Button } from "@repo/ui/components/button";
import { ArrowRight } from "lucide-react";
import { SectionWrapper } from "./section-wrapper";

export function Hero() {
  return (
    <SectionWrapper label="Introduction" showStripes>
      <div className="mx-auto max-w-6xl px-6 py-16 md:py-20 lg:px-12">
        <p className="mb-4 font-mono text-sm text-foreground/50">{"What's new in v1.0.0"}</p>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance text-foreground md:text-5xl lg:text-6xl">
          The secret manager built for the terminal
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-foreground/60">
          Client-side encrypted secrets management with complete control. Works as CLI, TUI, and
          through our SDK. Your secrets never leave your machine unencrypted.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Button
            className="gap-2 rounded-none border-2 border-foreground bg-foreground text-background hover:bg-foreground/90 px-6 py-2.5 h-auto font-medium"
            aria-label="Read documentation"
          >
            Read docs <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </SectionWrapper>
  );
}
