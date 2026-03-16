"use client";

import { cn } from "@repo/ui/lib/utils";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { SITE_FAQS } from "@/lib/site";
import { SectionWrapper } from "./section-wrapper";

export function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <SectionWrapper label="FAQ" id="faq">
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16 lg:px-12">
        <h2 className="text-xl font-semibold text-foreground sm:text-2xl">FAQ</h2>
        <p className="mt-2 text-sm text-foreground/60 text-pretty sm:text-base">
          Everything you need to know about Relic.
        </p>

        <div className="mt-6 border-2 border-border divide-y-2 divide-border sm:mt-8">
          {SITE_FAQS.map((faq, index) => (
            <button
              key={faq.question}
              type="button"
              onClick={() => setOpenIndex(openIndex === index ? null : index)}
              className={cn(
                "w-full text-left px-4 py-4 transition-colors sm:px-6 sm:py-5",
                openIndex === index ? "bg-foreground/5" : "hover:bg-muted/50",
              )}
            >
              <div className="flex items-center justify-between gap-3 sm:gap-4">
                <span className="font-medium text-foreground text-sm sm:text-base">
                  {faq.question}
                </span>
                <ChevronDown
                  className={cn(
                    "h-5 w-5 shrink-0 text-foreground/50 transition-transform duration-200",
                    openIndex === index && "rotate-180",
                  )}
                  aria-hidden="true"
                />
              </div>
              <div
                className={cn(
                  "grid transition-[grid-template-rows] duration-200",
                  openIndex === index ? "grid-rows-[1fr] mt-3" : "grid-rows-[0fr]",
                )}
              >
                <div className="overflow-hidden">
                  <p className="text-foreground/60 text-sm leading-relaxed text-pretty sm:pr-8">
                    {faq.answer}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3 text-sm text-foreground/60 sm:mt-8 sm:text-base">
          <span>Have more questions?</span>
          <a
            href="https://x.com/heycupola"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-foreground hover:text-foreground/80 transition-colors font-medium"
          >
            <span>DMs open</span>
            <span className="text-lg">𝕏</span>
          </a>
        </div>
      </div>
    </SectionWrapper>
  );
}
