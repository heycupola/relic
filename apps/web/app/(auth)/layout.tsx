import type { Metadata } from "next";
import { AuthLayoutClient } from "./auth-layout-client";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return <AuthLayoutClient>{children}</AuthLayoutClient>;
}
