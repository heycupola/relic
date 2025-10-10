import Image from "next/image";

export function TerminalShowcase() {
  return (
    <section className="px-8 py-8">
      <div className="w-full max-w-4xl mx-auto">
        <div className="relative w-full aspect-[16/10] rounded-lg overflow-hidden border border-border bg-graphite-grey/30 shadow-2xl">
          <Image
            src="/terminal-screenshot.png"
            alt="Terminal code editor showcase"
            fill
            className="object-cover"
            priority
          />
        </div>
      </div>
    </section>
  );
}
