import Image from "next/image";
import Link from "next/link";
import type React from "react";

interface HeroAction {
  href: string;
  label: string;
  external?: boolean;
}

interface ContentHeroProps {
  eyebrow: string;
  title: string;
  description: string;
  actions?: HeroAction[];
  meta?: React.ReactNode;
}

export function ContentHero({ eyebrow, title, description, actions = [], meta }: ContentHeroProps) {
  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14 lg:px-12">
        <div className="border-2 border-border bg-[#050505] px-5 py-5 sm:px-8 sm:py-8">
          <div className="flex flex-col gap-8">
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <Image
                  src="/relic-logo-light.svg"
                  alt=""
                  width={40}
                  height={40}
                  className="h-10 w-10"
                />
                <span className="font-mono text-xs uppercase tracking-[0.24em] text-foreground/50">
                  {eyebrow}
                </span>
              </div>
              <div className="space-y-4">
                <h1 className="max-w-4xl text-3xl font-semibold tracking-tight text-balance text-white sm:text-4xl md:text-5xl">
                  {title}
                </h1>
                <p className="max-w-2xl text-base leading-relaxed text-white/65 sm:text-lg">
                  {description}
                </p>
              </div>
            </div>

            {(actions.length > 0 || meta) && (
              <div className="flex flex-col gap-4 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
                {actions.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {actions.map((action) => (
                      <Link
                        key={action.href}
                        href={action.href}
                        target={action.external ? "_blank" : undefined}
                        rel={action.external ? "noopener noreferrer" : undefined}
                        className="border border-white/15 px-3 py-2 text-sm text-white/80 transition-colors hover:bg-white hover:text-black"
                      >
                        {action.label}
                      </Link>
                    ))}
                  </div>
                )}
                {meta && <div className="text-sm text-white/50">{meta}</div>}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
