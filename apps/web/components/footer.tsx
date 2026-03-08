import Image from "next/image";
import Link from "next/link";
import {
  BLOG_PATH,
  CHANGELOG_PATH,
  ENTERPRISE_URL,
  SITE_DOCS_URL,
  SITE_GITHUB_URL,
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
      className="group inline-flex items-center gap-2 border-2 border-border px-3 py-1.5 transition-colors hover:border-foreground/30"
      title="CCPA Compliant"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="square"
        strokeLinejoin="miter"
        className="text-muted-foreground/40 group-hover:text-foreground/60 transition-colors"
        aria-hidden="true"
      >
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
      <span className="text-[10px] font-semibold tracking-[0.15em] uppercase text-muted-foreground/40 group-hover:text-foreground/60 transition-colors">
        CCPA
      </span>
    </Link>
  );
}

function GdprBadge() {
  return (
    <Link
      href="/privacy-policy#gdpr"
      className="group inline-flex items-center gap-2 border-2 border-border px-3 py-1.5 transition-colors hover:border-foreground/30"
      title="GDPR Compliant"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        className="text-muted-foreground/40 group-hover:text-foreground/60 transition-colors"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
        {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((angle) => {
          const rad = (angle * Math.PI) / 180;
          const x = 12 + 7 * Math.cos(rad);
          const y = 12 + 7 * Math.sin(rad);
          return (
            <circle
              key={angle}
              cx={x.toFixed(1)}
              cy={y.toFixed(1)}
              r="1.2"
              fill="currentColor"
              stroke="none"
            />
          );
        })}
      </svg>
      <span className="text-[10px] font-semibold tracking-[0.15em] uppercase text-muted-foreground/40 group-hover:text-foreground/60 transition-colors">
        GDPR
      </span>
    </Link>
  );
}

export function Footer() {
  return (
    <footer className="relative mt-auto border-t border-border">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-12">
        <div className="grid grid-cols-2 gap-8 py-10 sm:grid-cols-4 sm:py-12">
          <div className="space-y-4">
            <h4 className="text-xs font-semibold tracking-[0.15em] uppercase text-foreground/40">
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
            <h4 className="text-xs font-semibold tracking-[0.15em] uppercase text-foreground/40">
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
            <h4 className="text-xs font-semibold tracking-[0.15em] uppercase text-foreground/40">
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
            <h4 className="text-xs font-semibold tracking-[0.15em] uppercase text-foreground/40">
              Support
            </h4>
            <nav className="flex flex-col gap-2.5">
              <a
                href="mailto:support@relic.so"
                className="text-sm text-muted-foreground transition-colors hover:text-foreground w-fit"
              >
                support@relic.so
              </a>
            </nav>
          </div>
        </div>

        <div className="py-6 sm:py-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
              <span className="text-[13px] text-muted-foreground/50">
                © {new Date().getFullYear()} relic
              </span>
              <a
                href="https://cupo.la"
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex items-center gap-2 text-[13px] text-muted-foreground/50 transition-colors hover:text-foreground"
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

            <div className="flex items-center gap-2">
              <CcpaBadge />
              <GdprBadge />
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
