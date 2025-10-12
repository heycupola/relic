import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";

import { AutumnProvider } from "autumn-js/react";
import { ConvexClientProvider } from "./providers";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Relic",
  description:
    "Manage project secrets the way you want with Relic – securely store and share them with your team.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${spaceGrotesk.variable} font-sans`}>
        <ConvexClientProvider>
          <AutumnProvider betterAuthUrl={process.env.NEXT_PUBLIC_BETTER_AUTH_URL}>
            {children}
          </AutumnProvider>
        </ConvexClientProvider>
      </body>
    </html>
  );
}
