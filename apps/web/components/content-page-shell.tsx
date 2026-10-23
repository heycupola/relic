import type React from "react";
import { ContainerLines } from "./container-lines";
import { Footer } from "./footer";
import { Header } from "./header";

interface ContentPageShellProps {
  children: React.ReactNode;
}

export function ContentPageShell({ children }: ContentPageShellProps) {
  return (
    <div data-smooth-scroll className="flex min-h-dvh flex-col bg-background text-foreground">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-foreground focus:text-background focus:outline-2 focus:outline-offset-2 focus:outline-foreground"
      >
        Skip to main content
      </a>
      <ContainerLines />
      <Header />
      <main id="main-content" className="flex-1">
        {children}
      </main>
      <Footer />
    </div>
  );
}
