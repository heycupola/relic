"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth";
import { RelicLogo } from "./relic-logo";

interface HeaderProps {
  showLogout?: boolean;
}

export function Header({ showLogout = false }: HeaderProps) {
  const router = useRouter();

  const handleLogout = async () => {
    await authClient.signOut();
    router.push("/");
  };

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6 lg:px-12">
        <Link href="/" className="flex items-center gap-2">
          <RelicLogo className="h-7 text-foreground" />
        </Link>
        {showLogout ? (
          <button
            type="button"
            onClick={handleLogout}
            className="text-sm text-muted-foreground transition-colors hover:text-foreground focus:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background rounded-sm px-3 py-1.5 cursor-pointer"
          >
            Logout
          </button>
        ) : (
          <nav className="hidden items-center gap-8 font-[family-name:var(--font-heading)] text-md text-muted-foreground md:flex">
            <Link
              href="/docs"
              className="transition-colors hover:text-foreground focus:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background rounded-sm px-1"
            >
              Docs
            </Link>
            <Link
              href="https://github.com/heycupola/relic"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-foreground focus:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background rounded-sm px-1"
            >
              GitHub
            </Link>
            <Link
              href="https://x.com/heycupola"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-foreground focus:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background rounded-sm px-1"
            >
              𝕏
            </Link>
          </nav>
        )}
      </div>
    </header>
  );
}
