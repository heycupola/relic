import Link from "next/link";

export function Features() {
  const features = [
    {
      title: "sdk",
      description: "a gateway to use your secrets in your project",
      href: "https://x.com/icanvardar",
    },
    {
      title: "tui",
      description: "terminal interface for visual control",
      href: "https://x.com/icanvardar",
    },
    {
      title: "cli",
      description: "manage your secrets from the terminal",
      href: "https://x.com/icanvardar",
    },
  ];

  return (
    <section className="px-8 py-8">
      <div className="flex items-stretch gap-2">
        {features.map((feature) => (
          <Link key={feature.title} href={feature.href} className="flex-1 group relative">
            <div className="absolute inset-0 border border-border rounded-md translate-x-1 translate-y-1 opacity-0 group-hover:opacity-100 transition-opacity" />

            <div className="relative h-32 border border-border rounded-md p-3 flex flex-col justify-between transition-transform group-hover:-translate-x-0.5 group-hover:-translate-y-0.5">
              <h3
                className="text-xl font-extralight text-soft-silver"
                style={{
                  lineHeight: "0.93",
                  letterSpacing: "-0.07em",
                }}
              >
                {feature.title}
              </h3>
              <p
                className="text-sm font-extralight text-soft-silver"
                style={{
                  lineHeight: "0.93",
                  letterSpacing: "-0.07em",
                }}
              >
                {feature.description}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
