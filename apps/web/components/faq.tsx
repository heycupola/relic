"use client";

import { cn } from "@repo/ui/lib/utils";
import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";
import { SITE_FAQS, SITE_X_URL } from "@/lib/site";
import { focusRing } from "@/lib/styles";
import { SectionWrapper } from "./section-wrapper";

export function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const baseId = useId();

  return (
    <SectionWrapper label="FAQ" id="faq">
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16 lg:px-12">
        <h2 className="text-xl font-semibold text-foreground sm:text-2xl">FAQ</h2>
        <p className="mt-2 text-sm text-foreground/60 text-pretty sm:text-base">
          Everything you need to know about Relic.
        </p>

        <div className="mt-6 border-2 border-border divide-y-2 divide-border sm:mt-8">
          {SITE_FAQS.map((faq, index) => {
            const isOpen = openIndex === index;
            const buttonId = `${baseId}-question-${index}`;
            const panelId = `${baseId}-answer-${index}`;

            return (
              <div key={faq.question} className={cn(isOpen && "bg-foreground/5")}>
                <h3>
                  <button
                    id={buttonId}
                    type="button"
                    onClick={() => setOpenIndex(isOpen ? null : index)}
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 px-4 py-4 text-left transition-colors focus-visible:outline-offset-[-2px] sm:gap-4 sm:px-6 sm:py-5",
                      focusRing,
                      !isOpen && "hover:bg-muted/50",
                    )}
                  >
                    <span className="font-medium text-foreground text-sm sm:text-base">
                      {faq.question}
                    </span>
                    <ChevronDown
                      className={cn(
                        "h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200",
                        isOpen && "rotate-180",
                      )}
                      aria-hidden="true"
                    />
                  </button>
                </h3>
                <section
                  id={panelId}
                  aria-labelledby={buttonId}
                  hidden={!isOpen}
                  className="px-4 pb-4 sm:px-6 sm:pb-5"
                >
                  <p className="text-foreground/70 text-sm leading-relaxed text-pretty sm:pr-8">
                    {faq.answer}
                  </p>
                </section>
              </div>
            );
          })}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3 text-sm text-foreground/60 sm:mt-8 sm:text-base">
          <span>Have more questions?</span>
          <a
            href={SITE_X_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center gap-2 text-foreground hover:text-foreground/80 transition-colors font-medium ${focusRing}`}
          >
            <span>
              DMs open<span className="sr-only"> on X (Twitter)</span>
            </span>
            <span className="text-lg" aria-hidden="true">
              𝕏
            </span>
          </a>
        </div>
      </div>
    </SectionWrapper>
  );
}
