import { Features } from "@/components/features";
import { Footer } from "@/components/footer";
import { GridContainer, Section } from "@/components/grid-container";
import { Hero } from "@/components/hero";
import { Navbar } from "@/components/navbar";
import { Supporters } from "@/components/supporters";
import { TerminalShowcase } from "@/components/terminal-showcase";

export default function Home() {
  return (
    <GridContainer>
      <Section className="border-t-0">
        <Navbar />
      </Section>

      <Section>
        <div className="relative">
          <div className="absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2 text-electric-ink text-xs font-bold pointer-events-none select-none z-10">
            +
          </div>
          <div className="absolute right-0 top-0 translate-x-1/2 -translate-y-1/2 text-electric-ink text-xs font-bold pointer-events-none select-none z-10">
            +
          </div>
          <div className="absolute left-0 bottom-0 -translate-x-1/2 translate-y-1/2 text-electric-ink text-xs font-bold pointer-events-none select-none z-10">
            +
          </div>
          <div className="absolute right-0 bottom-0 translate-x-1/2 translate-y-1/2 text-electric-ink text-xs font-bold pointer-events-none select-none z-10">
            +
          </div>
          <Hero />
        </div>
      </Section>

      <Section>
        <TerminalShowcase />
      </Section>

      <Section>
        <Features />
      </Section>

      <Section>
        <Supporters />
      </Section>

      <Section className="mt-auto">
        <Footer />
      </Section>
    </GridContainer>
  );
}
