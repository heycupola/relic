import type { Metadata } from "next";
import { ContainerLines } from "@/components/container-lines";
import { Header } from "@/components/header";
import { MinifiedFooter } from "@/components/minified-footer";

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <ContainerLines />
      <Header showLogout />
      <main className="flex-1">{children}</main>
      <MinifiedFooter />
    </div>
  );
}
