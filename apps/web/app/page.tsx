import { AppPreview } from "@/components/app-preview";
import { ContainerLines } from "@/components/container-lines";
import { FAQ } from "@/components/faq";
import { Features } from "@/components/features";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { Hero } from "@/components/hero";
import { HowItWorks } from "@/components/how-it-works";
import { InstallSection } from "@/components/install-section";
import { Pricing } from "@/components/pricing";
import { SDKSection } from "@/components/sdk-section";

export default function Home() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
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
        <HowItWorks />
        <SDKSection />
        <Pricing />
        <FAQ />
      </main>
      <Footer />
    </div>
  );
}
