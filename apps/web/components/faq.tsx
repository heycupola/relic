"use client";

import { cn } from "@repo/ui/lib/utils";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { SectionWrapper } from "./section-wrapper";

const faqs = [
  {
    question: "Can you see my secrets?",
    answer:
      "No. Your secrets are encrypted on your device before anything is sent to us. We literally cannot read them. Only you hold the keys.",
  },
  {
    question: "Where does my data go?",
    answer:
      "Your secrets are encrypted on your machine, then stored safely on our servers. We only ever see encrypted data, never the real values.",
  },
  {
    question: "How secure is Relic?",
    answer:
      "Very. We use the same encryption standards trusted by banks and governments (AES-256 + Argon2id). Everything is encrypted before it leaves your device.",
  },
  {
    question: "Can I share secrets with my team?",
    answer:
      "Yes, invite teammates by email and they get access to the project. Each person's secrets are encrypted with their own keys, so sharing stays fully secure.",
  },
  {
    question: "Can I use Relic in CI/CD pipelines?",
    answer:
      "Absolutely. The CLI is designed for automation. You can easily integrate Relic into GitHub Actions, GitLab CI, Jenkins, or any other CI/CD system.",
  },
  {
    question: "Do my secrets sync across devices?",
    answer:
      "Yes, automatically. Your encrypted secrets sync through our servers, but since everything is encrypted on your device first, we never see the actual values.",
  },
  {
    question: "Which programming languages are supported?",
    answer:
      "All of them. Relic is completely language agnostic. Any language, any framework. Just use relic run to inject secrets as environment variables into any process.",
  },
];

export function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <SectionWrapper label="FAQ" id="faq">
      <div className="mx-auto max-w-6xl px-6 py-16 lg:px-12">
        <h2 className="text-2xl font-semibold text-foreground">FAQ</h2>
        <p className="mt-2 text-foreground/60 text-pretty">
          Everything you need to know about Relic.
        </p>

        <div className="mt-8 border-2 border-border divide-y-2 divide-border">
          {faqs.map((faq, index) => (
            <button
              key={faq.question}
              type="button"
              onClick={() => setOpenIndex(openIndex === index ? null : index)}
              className={cn(
                "w-full text-left px-6 py-5 transition-colors",
                openIndex === index ? "bg-foreground/5" : "hover:bg-muted/50",
              )}
            >
              <div className="flex items-center justify-between gap-4">
                <span className="font-medium text-foreground">{faq.question}</span>
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
                  "overflow-hidden transition-all duration-200",
                  openIndex === index ? "mt-3 max-h-40" : "max-h-0",
                )}
              >
                <p className="text-foreground/60 text-sm leading-relaxed pr-8 text-pretty">
                  {faq.answer}
                </p>
              </div>
            </button>
          ))}
        </div>

        <div className="mt-8 flex items-center gap-3 text-foreground/60">
          <span>Have more questions?</span>
          <Link
            href="https://x.com/heycupola"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-foreground hover:text-foreground/80 transition-colors font-medium"
          >
            <span>DMs open</span>
            <span className="text-lg">𝕏</span>
          </Link>
        </div>
      </div>
    </SectionWrapper>
  );
}
