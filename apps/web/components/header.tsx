import Link from "next/link";
import { RelicLogo } from "./relic-logo";

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6 lg:px-12">
        <Link href="/" className="flex items-center gap-2">
          <RelicLogo className="h-7 text-foreground" />
        </Link>
        <nav className="hidden items-center gap-8 font-[family-name:var(--font-heading)] text-md text-muted-foreground md:flex">
          <Link
            href="/docs"
            className="transition-colors hover:text-foreground focus:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background rounded-sm px-1"
          >
            Docs
          </Link>
          <Link
            href="https://github.com/cupolalabs/relic"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-foreground focus:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background rounded-sm px-1"
          >
            GitHub
          </Link>
          <Link
            href="https://x.com/cupolalabs"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-foreground focus:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background rounded-sm px-1"
          >
            𝕏
          </Link>
        </nav>
      </div>
    </header>
  );
}
