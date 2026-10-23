import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { SITE_DOCS_URL } from "@/lib/site";
import { primaryButton } from "@/lib/styles";
import { InstallSection } from "./install-section";
import { SectionWrapper } from "./section-wrapper";

interface ContentCtaProps {
  title: string;
  description: string;
}

export function ContentCta({ title, description }: ContentCtaProps) {
  return (
    <SectionWrapper label="Get started with Relic" showStripes>
      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 px-4 py-12 sm:px-6 sm:py-16 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] md:items-center md:gap-10 lg:px-12">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground text-balance sm:text-2xl">
            {title}
          </h2>
          <p className="mt-2 max-w-md text-sm text-foreground/60 text-pretty sm:text-base">
            {description}
          </p>
          <Link
            href={SITE_DOCS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={`mt-6 inline-flex items-center gap-2 px-5 py-2.5 text-sm ${primaryButton}`}
          >
            Read the docs <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
        <InstallSection showWrapper={false} />
      </div>
    </SectionWrapper>
  );
}
