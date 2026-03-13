import Link from "next/link";
import { SITE_DOCS_URL, SITE_STATUS_URL } from "@/lib/site";

const footerLinks: ReadonlyArray<{ href: string; label: string; external?: boolean }> = [
  { href: SITE_DOCS_URL, label: "Docs", external: true },
  { href: SITE_STATUS_URL, label: "Status", external: true },
];

export function DashboardFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-5 lg:px-12">
        <p>© {new Date().getFullYear()} relic</p>
        <nav aria-label="Dashboard footer" className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {footerLinks.map((link) =>
            link.external ? (
              <Link
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors hover:text-foreground"
              >
                {link.label}
              </Link>
            ) : (
              <Link
                key={link.href}
                href={link.href}
                className="transition-colors hover:text-foreground"
              >
                {link.label}
              </Link>
            ),
          )}
          <a href="mailto:support@relic.so" className="transition-colors hover:text-foreground">
            Support
          </a>
          <Link href="/privacy-policy" className="transition-colors hover:text-foreground">
            Privacy
          </Link>
          <Link href="/terms-of-service" className="transition-colors hover:text-foreground">
            Terms
          </Link>
        </nav>
      </div>
    </footer>
  );
}
