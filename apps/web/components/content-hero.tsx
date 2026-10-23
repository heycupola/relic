import Link from "next/link";
import type React from "react";
import { focusRing } from "@/lib/styles";

export interface ContentHeroLink {
  href: string;
  label: string;
  icon?: React.ReactNode;
  external?: boolean;
}

interface ContentHeroProps {
  eyebrow: string;
  title: string;
  description: string;
  links?: ContentHeroLink[];
  children?: React.ReactNode;
}

export function ContentHero({
  eyebrow,
  title,
  description,
  links = [],
  children,
}: ContentHeroProps) {
  return (
    <section aria-labelledby="content-hero-title" className="border-b border-border">
      <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6 sm:py-16 md:py-20 lg:px-12">
        <p className="mb-4 font-mono text-xs text-foreground/60 sm:text-sm">{eyebrow}</p>
        <h1
          id="content-hero-title"
          className="max-w-3xl text-3xl font-semibold tracking-tight text-balance text-foreground sm:text-4xl md:text-5xl"
        >
          {title}
        </h1>
        <p className="mt-5 max-w-2xl text-base text-foreground/60 text-pretty sm:mt-6 sm:text-lg">
          {description}
        </p>

        {links.length > 0 && (
          <div className="mt-8 flex flex-wrap gap-2 sm:gap-3">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                target={link.external ? "_blank" : undefined}
                rel={link.external ? "noopener noreferrer" : undefined}
                className={`inline-flex items-center gap-2 border-2 border-border bg-background px-3.5 py-2 text-sm font-medium text-foreground transition-colors hover:border-foreground/40 hover:bg-muted/50 ${focusRing}`}
              >
                {link.icon}
                {link.label}
              </Link>
            ))}
          </div>
        )}

        {children}
      </div>
    </section>
  );
}
