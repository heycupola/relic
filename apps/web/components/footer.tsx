import { ShieldCheck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import {
  BLOG_PATH,
  CHANGELOG_PATH,
  ENTERPRISE_URL,
  SITE_DOCS_URL,
  SITE_GITHUB_URL,
  SITE_STATUS_URL,
  SITE_X_URL,
} from "@/lib/site";

const productLinks = [
  { href: SITE_DOCS_URL, label: "Docs", external: true },
  { href: BLOG_PATH, label: "Blog" },
  { href: CHANGELOG_PATH, label: "Changelog" },
  { href: ENTERPRISE_URL, label: "Enterprise", external: true },
] as const;

const legalLinks = [
  { href: "/privacy-policy", label: "Privacy Policy" },
  { href: "/terms-of-service", label: "Terms of Service" },
  { href: "/dpa", label: "DPA" },
] as const;

const socialLinks = [
  { href: SITE_GITHUB_URL, label: "GitHub", external: true },
  { href: "https://discord.gg/relic", label: "Discord", external: true },
  { href: SITE_X_URL, label: "𝕏", external: true },
] as const;

function CcpaBadge() {
  return (
    <Link
      href="/privacy-policy#ccpa"
      className="group inline-flex items-center gap-1.5 transition-colors"
      title="CCPA Compliant"
    >
      <ShieldCheck
        size={18}
        className="shrink-0 text-muted-foreground/60 group-hover:text-foreground/80 transition-colors"
        aria-hidden="true"
      />
      <span className="text-[13px] leading-none font-medium text-muted-foreground/60 group-hover:text-foreground/80 transition-colors">
        CCPA
      </span>
    </Link>
  );
}

function GdprBadge() {
  return (
    <Link
      href="/privacy-policy#gdpr"
      className="group inline-flex items-center gap-1.5 transition-colors"
      title="GDPR Compliant"
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="currentColor"
        className="shrink-0 text-muted-foreground/60 group-hover:text-foreground/80 transition-colors"
        aria-hidden="true"
      >
        <path d="M11.373 1.94 10.36 1.2h1.253L12 0l.387 1.2h1.253l-1.013.74.386 1.207L12 2.4l-1.013.747Zm1.254 20.86.386 1.2L12 23.26l-1.013.74.386-1.2-1.013-.74h1.253L12 20.853l.387 1.207h1.253ZM1.64 12.8l-1.013.747.386-1.2L0 11.627h1.253l.387-1.2.387 1.2h1.26l-1.02.746.386 1.2-1.013-.746Zm5.807-9.467.386 1.2L6.82 3.8l-1.013.74.386-1.2L5.18 2.6h1.253l.387-1.2.387 1.2H8.46Zm-4.78 3.08.386-1.2.394 1.2h1.22l-1.014.747.387 1.2-1.02-.747L2 8.36l.387-1.2-1.014-.747ZM1.387 16.84h1.28l.386-1.2.394 1.2h1.22l-1.014.747.387 1.2-1.02-.74-1.02.74.387-1.2-1.014-.747Zm4.806 4.56-1.013-.733h1.253l.387-1.2.387 1.2H8.46l-1.013.733.386 1.2-1.013-.74-1.013.74Zm16.794-9.027.386 1.2-1.013-.746-1.027.746.387-1.2-1.02-.746H22l.387-1.2.386 1.2H24Zm-6.434-9.04L15.54 2.6h1.253l.387-1.2.387 1.2h1.253l-1.013.733.386 1.2L17.18 3.8l-1.013.74.386-1.2Zm4 3.074.394-1.2.386 1.2h1.254l-.987.753.387 1.2-1.014-.747-1.02.747.387-1.2-1.007-.747Zm.78 10.433h1.254l-.987.747.387 1.2-1.014-.74-1.02.74.387-1.2-1.007-.747h1.254l.393-1.2.387 1.2zm-2.513 3.827-1.013.733.386 1.2-1.013-.74-1.013.74.386-1.2-1.013-.733h1.253l.387-1.2.387 1.2z" />
      </svg>
      <span className="text-[13px] leading-none font-medium text-muted-foreground/60 group-hover:text-foreground/80 transition-colors">
        GDPR
      </span>
    </Link>
  );
}

export function Footer() {
  return (
    <footer className="relative mt-auto border-t border-border">
      <div className="mx-auto max-w-6xl px-6 lg:px-12">
        <div className="grid grid-cols-2 gap-8 py-10 sm:grid-cols-4 sm:py-12">
          <div className="space-y-4">
            <h4 className="text-xs font-semibold tracking-[0.15em] uppercase text-foreground/60">
              Product
            </h4>
            <nav className="flex flex-col gap-2.5">
              {productLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  target={"external" in link ? "_blank" : undefined}
                  rel={"external" in link ? "noopener noreferrer" : undefined}
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground w-fit"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="space-y-4">
            <h4 className="text-xs font-semibold tracking-[0.15em] uppercase text-foreground/60">
              Legal
            </h4>
            <nav className="flex flex-col gap-2.5">
              {legalLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground w-fit"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="space-y-4">
            <h4 className="text-xs font-semibold tracking-[0.15em] uppercase text-foreground/60">
              Community
            </h4>
            <nav className="flex flex-col gap-2.5">
              {socialLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground w-fit"
                >
                  {link.label}
                </a>
              ))}
            </nav>
          </div>

          <div className="space-y-4">
            <h4 className="text-xs font-semibold tracking-[0.15em] uppercase text-foreground/60">
              Support
            </h4>
            <nav className="flex flex-col gap-2.5">
              <a
                href="mailto:support@relic.so"
                className="text-sm text-muted-foreground transition-colors hover:text-foreground w-fit"
              >
                support@relic.so
              </a>
              <a
                href={SITE_STATUS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-muted-foreground transition-colors hover:text-foreground w-fit"
              >
                Status Page
              </a>
            </nav>
          </div>
        </div>

        <div className="py-6 sm:py-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
              <span className="text-[13px] text-muted-foreground/70">
                © {new Date().getFullYear()} relic
              </span>
              <a
                href="https://cupo.la"
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex items-center gap-2 text-[13px] text-muted-foreground/70 transition-colors hover:text-foreground"
              >
                <span>Built by</span>
                <Image
                  src="/cupola-dark.svg"
                  alt="Cupola"
                  width={80}
                  height={16}
                  className="h-[18px] w-auto dark:hidden opacity-40 group-hover:opacity-100 transition-opacity"
                />
                <Image
                  src="/cupola-light.svg"
                  alt="Cupola"
                  width={80}
                  height={16}
                  className="h-[18px] w-auto hidden dark:block opacity-40 group-hover:opacity-100 transition-opacity"
                />
              </a>
            </div>

            <div className="flex items-center gap-5">
              <CcpaBadge />
              <GdprBadge />
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
