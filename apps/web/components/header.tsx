"use client";

import { useConvexAuth } from "convex/react";
import { Menu, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth";
import { LogoContextMenu } from "./logo-context-menu";

interface HeaderProps {
  showLogout?: boolean;
}

export function Header({ showLogout = false }: HeaderProps) {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const handleLogout = async () => {
    await authClient.signOut();
    router.push("/");
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
    });
  };

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6 lg:px-12">
        <Link
          href="/"
          className="flex items-center gap-2 -mx-3 px-3 py-2 rounded-md transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          onContextMenu={handleContextMenu}
        >
          <Image
            src="/relic-logo-wordmark-dark.svg"
            alt="Relic"
            width={70}
            height={28}
            className="h-7 w-auto dark:hidden"
            priority
            fetchPriority="high"
          />
          <Image
            src="/relic-logo-wordmark-light.svg"
            alt="Relic"
            width={70}
            height={28}
            className="h-7 w-auto hidden dark:block"
            priority
            fetchPriority="high"
          />
        </Link>
        {showLogout ? (
          <button
            type="button"
            onClick={handleLogout}
            className="font-[family-name:var(--font-heading)] text-md text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm px-1"
          >
            Logout
          </button>
        ) : (
          <>
            <nav className="hidden items-center gap-8 font-[family-name:var(--font-heading)] text-md text-muted-foreground md:flex">
              <Link
                href="/docs"
                className="transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm px-1"
              >
                Docs
              </Link>
              {!isLoading && isAuthenticated && (
                <Link
                  href="/dashboard"
                  className="transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm px-1"
                >
                  Dashboard
                </Link>
              )}
            </nav>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 text-foreground hover:text-foreground/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm"
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-menu"
            >
              {mobileMenuOpen ? (
                <X className="h-6 w-6" aria-hidden="true" />
              ) : (
                <Menu className="h-6 w-6" aria-hidden="true" />
              )}
            </button>
          </>
        )}
      </div>
      {/* Mobile menu */}
      {!showLogout && mobileMenuOpen && (
        <div id="mobile-menu" className="md:hidden border-t border-border bg-background">
          <nav className="flex flex-col px-6 py-4 gap-4 font-[family-name:var(--font-heading)] text-md">
            <Link
              href="/docs"
              className="text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm px-1 py-2"
              onClick={() => setMobileMenuOpen(false)}
            >
              Docs
            </Link>
            {!isLoading && isAuthenticated && (
              <Link
                href="/dashboard"
                className="text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm px-1 py-2"
                onClick={() => setMobileMenuOpen(false)}
              >
                Dashboard
              </Link>
            )}
          </nav>
        </div>
      )}
      {contextMenu && (
        <LogoContextMenu x={contextMenu.x} y={contextMenu.y} onClose={() => setContextMenu(null)} />
      )}
    </header>
  );
}
