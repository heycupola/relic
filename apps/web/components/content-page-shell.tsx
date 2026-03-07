import type React from "react";
import { ContainerLines } from "./container-lines";
import { Footer } from "./footer";
import { Header } from "./header";

interface ContentPageShellProps {
  children: React.ReactNode;
}

export function ContentPageShell({ children }: ContentPageShellProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <ContainerLines />
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
