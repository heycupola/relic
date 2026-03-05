import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import Script from "next/script";

import { ConvexClientProvider, PostHogProvider, ThemeProvider } from "./providers";

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });
const _spaceGrotesk = Space_Grotesk({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "relic - Encrypted Secrets, Fully Under Your Control",
  description:
    "Zero-knowledge secrets management with complete control. Works as CLI, TUI, and through our SDK.",
  generator: "v0.app",
  icons: {
    icon: [
      {
        url: "/icon-light-32x32.png",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/icon-dark-32x32.png",
        media: "(prefers-color-scheme: dark)",
      },
      {
        url: "/icon.svg",
        type: "image/svg+xml",
      },
    ],
    apple: "/apple-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#252525" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const hydrationLockdownScript = `
    (function () {
      var ensureBodyStable = function () {
        var body = document.body;
        if (!body) return;

        if (body.className !== "font-sans antialiased") {
          body.className = "font-sans antialiased";
        }

        if (body.hasAttribute("cz-shortcut-listen")) {
          body.removeAttribute("cz-shortcut-listen");
        }
      };

      ensureBodyStable();

      var observer = new MutationObserver(ensureBodyStable);
      observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });

      var attempts = 0;
      var interval = setInterval(function () {
        ensureBodyStable();
        attempts += 1;

        if (attempts >= 25) {
          clearInterval(interval);
        }
      }, 200);

      setTimeout(function () {
        observer.disconnect();
        clearInterval(interval);
      }, 5000);
    })();
  `;

  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5" />
        <Script id="relic-hydration-lockdown" strategy="beforeInteractive">
          {hydrationLockdownScript}
        </Script>
      </head>
      <body className={`font-sans antialiased`}>
        <PostHogProvider>
          <ConvexClientProvider>
            <ThemeProvider>{children}</ThemeProvider>
          </ConvexClientProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}
