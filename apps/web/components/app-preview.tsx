"use client";

import Image from "next/image";
import { SectionWrapper } from "./section-wrapper";

export function AppPreview() {
  return (
    <SectionWrapper label="Preview" showStripes>
      <div className="mx-auto max-w-6xl">
        <div className="aspect-video w-full bg-muted">
          <Image
            src="/app-preview-light.png"
            alt="Relic terminal interface demonstration"
            width={1920}
            height={1080}
            className="h-full w-full object-cover dark:hidden"
          />
          <Image
            src="/app-preview-dark.png"
            alt="Relic terminal interface demonstration"
            width={1920}
            height={1080}
            className="h-full w-full object-cover hidden dark:block"
          />
        </div>
      </div>
    </SectionWrapper>
  );
}
