import Image from "next/image";
import Link from "next/link";
import { BLOG_PATH, CHANGELOG_PATH, ENTERPRISE_URL } from "@/lib/site";

const navLinks = [
  { href: BLOG_PATH, label: "Blog" },
  { href: CHANGELOG_PATH, label: "Changelog" },
  { href: ENTERPRISE_URL, label: "Enterprise", external: true },
  { href: "/privacy-policy", label: "Privacy" },
  { href: "/terms-of-service", label: "Terms" },
] as const;

const socialLinks = [
  { href: "/github", label: "GitHub" },
  { href: "/x", label: "X" },
] as const;

export function Footer() {
  return (
    <footer className="relative mt-auto border-t border-border">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-12">
        <div className="flex flex-col items-start justify-between gap-4 py-6 sm:flex-row sm:items-center sm:py-8">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                target={"external" in link ? "_blank" : undefined}
                rel={"external" in link ? "noopener noreferrer" : undefined}
                className="text-muted-foreground transition-colors hover:text-foreground focus:text-foreground focus:outline-none rounded-sm"
              >
                {link.label}
              </Link>
            ))}
          </div>
          <div className="flex items-center gap-x-5 text-sm">
            {socialLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-muted-foreground transition-colors hover:text-foreground focus:text-foreground focus:outline-none rounded-sm"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="flex flex-col items-start justify-between gap-4 pb-6 sm:flex-row sm:items-center sm:pb-8">
          <span className="text-[13px] text-muted-foreground/60">
            © {new Date().getFullYear()} relic
          </span>
          <a
            href="https://cupo.la"
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center gap-2 text-[13px] text-muted-foreground/60 transition-colors hover:text-foreground focus:text-foreground focus:outline-none rounded-sm"
          >
            <span>Built by</span>
            <Image
              src="/cupola-dark.svg"
              alt="Cupola"
              width={80}
              height={16}
              className="h-[18px] w-auto dark:hidden opacity-50 group-hover:opacity-100 transition-opacity"
            />
            <Image
              src="/cupola-light.svg"
              alt="Cupola"
              width={80}
              height={16}
              className="h-[18px] w-auto hidden dark:block opacity-50 group-hover:opacity-100 transition-opacity"
            />
          </a>
        </div>
      </div>
    </footer>
  );
}
