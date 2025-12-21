import { AppPreview } from "@/components/app-preview";
import { ContainerLines } from "@/components/container-lines";
import { FAQ } from "@/components/faq";
import { Features } from "@/components/features";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { Hero } from "@/components/hero";
import { HowItWorks } from "@/components/how-it-works";
import { InstallSection } from "@/components/install-section";
import { SDKSection } from "@/components/sdk-section";

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <ContainerLines />
      <Header />
      <main>
        <Hero />
        <InstallSection />
        <AppPreview />
        <Features />
        <HowItWorks />
        <SDKSection />
        <FAQ />
      </main>
      <Footer />
    </div>
  );
}
