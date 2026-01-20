"use client";

import { cn } from "@repo/ui/lib/utils";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { SectionWrapper } from "./section-wrapper";

const faqs = [
  {
    question: "Is Relic really zero-knowledge?",
    answer:
      "Yes. All encryption and decryption happens locally on your machine. Your secrets are encrypted before they ever leave your device, and only you hold the keys. We never have access to your unencrypted data.",
  },
  {
    question: "Where are my secrets stored?",
    answer:
      "Secrets are stored locally in an encrypted vault on your machine. You have full control over your data, and you can back it up or sync it however you prefer.",
  },
  {
    question: "What encryption does Relic use?",
    answer:
      "Relic uses industry-standard AES-256-GCM encryption with keys derived using Argon2id. This provides strong protection against both brute-force attacks and side-channel attacks.",
  },
  {
    question: "Can I use Relic in CI/CD pipelines?",
    answer:
      "Absolutely. The CLI is designed for automation. You can easily integrate Relic into GitHub Actions, GitLab CI, Jenkins, or any other CI/CD system.",
  },
  {
    question: "Is there a cloud sync option?",
    answer:
      "Relic is designed as a local-first tool. However, you can use your own sync solution (like git, Syncthing, or cloud storage) to sync your encrypted vault across machines.",
  },
  {
    question: "Which programming languages are supported?",
    answer:
      "We provide official SDKs for JavaScript/TypeScript, Python, Go, and Rust. You can also use the REST API directly from any language.",
  },
];

export function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <SectionWrapper label="FAQ" id="faq" showStripes>
      <div className="mx-auto max-w-6xl px-6 py-16 lg:px-12">
        <h2 className="text-2xl font-semibold text-foreground">FAQ</h2>
        <p className="mt-2 text-foreground/60">Everything you need to know about Relic.</p>

        <div className="mt-8 border-2 border-border divide-y-2 divide-border">
          {faqs.map((faq, index) => (
            <button
              // biome-ignore lint/suspicious/noArrayIndexKey: faqs are static
              key={index}
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
                />
              </div>
              <div
                className={cn(
                  "overflow-hidden transition-all duration-200",
                  openIndex === index ? "mt-3 max-h-40" : "max-h-0",
                )}
              >
                <p className="text-foreground/60 text-sm leading-relaxed pr-8">{faq.answer}</p>
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
