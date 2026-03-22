import type { Metadata } from "next";
import { AppPreview } from "@/components/app-preview";
import { ContainerLines } from "@/components/container-lines";
import { FAQ } from "@/components/faq";
import { Features } from "@/components/features";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { Hero } from "@/components/hero";
import { InstallSection } from "@/components/install-section";
import { Pricing } from "@/components/pricing";
import {
  getAbsoluteUrl,
  SITE_BRAND_NAME,
  SITE_DESCRIPTION,
  SITE_FAQS,
  SITE_NAME,
  SITE_URL,
} from "@/lib/site";

export const metadata: Metadata = {
  description: SITE_DESCRIPTION,
  alternates: {
    canonical: "/",
  },
};

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}#organization`,
      name: SITE_BRAND_NAME,
      url: SITE_URL,
      logo: getAbsoluteUrl("/apple-icon.png"),
      sameAs: [
        "https://github.com/heycupola/relic",
        "https://x.com/heycupola",
        "https://docs.relic.so",
      ],
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}#website`,
      name: SITE_NAME,
      url: SITE_URL,
      description: SITE_DESCRIPTION,
      inLanguage: "en-US",
      publisher: {
        "@id": `${SITE_URL}#organization`,
      },
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${SITE_URL}#software-application`,
      name: SITE_BRAND_NAME,
      url: SITE_URL,
      description: SITE_DESCRIPTION,
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Web, macOS, Linux, Windows",
      featureList: [
        "Client-side encrypted secrets management",
        "CLI, TUI, and web dashboard access",
        "Encrypted secret sharing for teams",
        "Secret injection for local workflows and CI/CD",
      ],
      offers: [
        {
          "@type": "Offer",
          name: "Free",
          price: "0",
          priceCurrency: "USD",
        },
        {
          "@type": "Offer",
          name: "Pro",
          price: "20",
          priceCurrency: "USD",
        },
      ],
      publisher: {
        "@id": `${SITE_URL}#organization`,
      },
    },
    {
      "@type": "FAQPage",
      "@id": `${SITE_URL}#faq`,
      mainEntity: SITE_FAQS.map((faq) => ({
        "@type": "Question",
        name: faq.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: faq.answer,
        },
      })),
    },
  ],
};

const structuredDataJson = JSON.stringify(structuredData).replace(/</g, "\\u003c");

export default function Home() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: structuredDataJson }} />
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-foreground focus:text-background focus:rounded focus:outline-none focus:ring-2 focus:ring-ring"
      >
        Skip to main content
      </a>
      <ContainerLines />
      <Header />
      <main id="main-content">
        <Hero />
        <InstallSection />
        <AppPreview />
        <Features />
        <Pricing />
        <FAQ />
      </main>
      <Footer />
    </div>
  );
}
