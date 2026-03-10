import type { Metadata } from "next";
import { LoginLayoutClient } from "./login-layout-client";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

interface LayoutProps {
  children: React.ReactNode;
}

export default function LoginLayout({ children }: LayoutProps) {
  return <LoginLayoutClient>{children}</LoginLayoutClient>;
}
