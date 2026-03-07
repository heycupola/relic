import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { Agentation } from "agentation";
import Script from "next/script";
import {
  BLOG_FEED_PATH,
  CHANGELOG_FEED_PATH,
  getAbsoluteUrl,
  SITE_AUTHOR,
  SITE_AUTHOR_URL,
  SITE_DESCRIPTION,
  SITE_KEYWORDS,
  SITE_NAME,
  SITE_TITLE,
  SITE_TWITTER_HANDLE,
  SITE_URL,
} from "@/lib/site";

import { ConvexClientProvider, PostHogProvider, ThemeProvider } from "./providers";

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });
const _spaceGrotesk = Space_Grotesk({ subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: SITE_NAME,
  title: {
    default: SITE_TITLE,
    template: "%s - relic",
  },
  description: SITE_DESCRIPTION,
  alternates: {
    canonical: "/",
  },
  keywords: [...SITE_KEYWORDS],
  authors: [{ name: SITE_AUTHOR, url: SITE_AUTHOR_URL }],
  creator: SITE_AUTHOR,
  category: "DeveloperApplication",
  referrer: "origin-when-cross-origin",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: getAbsoluteUrl("/og?type=home"),
        width: 1200,
        height: 630,
        alt: SITE_TITLE,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    creator: SITE_TWITTER_HANDLE,
    site: SITE_TWITTER_HANDLE,
    images: [getAbsoluteUrl("/og?type=home")],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
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
        <link rel="manifest" href="/manifest.webmanifest" />
        <link
          rel="alternate"
          type="application/rss+xml"
          title="relic Blog RSS Feed"
          href={BLOG_FEED_PATH}
        />
        <link
          rel="alternate"
          type="application/rss+xml"
          title="relic Changelog RSS Feed"
          href={CHANGELOG_FEED_PATH}
        />
        <link rel="icon" href="/icon.svg" sizes="any" type="image/svg+xml" />
        <link rel="shortcut icon" href="/icon.svg" />
        <link
          rel="icon"
          href="/icon-light-32x32.png"
          sizes="32x32"
          type="image/png"
          media="(prefers-color-scheme: light)"
        />
        <link
          rel="icon"
          href="/icon-dark-32x32.png"
          sizes="32x32"
          type="image/png"
          media="(prefers-color-scheme: dark)"
        />
        <link rel="apple-touch-icon" href="/apple-icon.png" sizes="180x180" />
        <Script id="relic-hydration-lockdown" strategy="beforeInteractive">
          {hydrationLockdownScript}
        </Script>
      </head>
      <body className={`font-sans antialiased`}>
        {process.env.NODE_ENV === "development" && <Agentation />}
        <PostHogProvider>
          <ConvexClientProvider>
            <ThemeProvider>{children}</ThemeProvider>
          </ConvexClientProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}
