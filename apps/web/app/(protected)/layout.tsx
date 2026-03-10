import type { Metadata } from "next";
import { ProtectedLayoutClient } from "./protected-layout-client";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

interface LayoutProps {
  children: React.ReactNode;
}

export default function ProtectedLayout({ children }: LayoutProps) {
  return <ProtectedLayoutClient>{children}</ProtectedLayoutClient>;
}
