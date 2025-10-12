import Image from "next/image";
import Link from "next/link";

export function Supporters() {
  const supporters = [
    { name: "Mail0", logo: "/zero-logo.svg", url: "https://0.email" },
    { name: "Ratatui", logo: "/ratatui-logo.svg", url: "https://ratatui.rs" },
    { name: "oss.now", logo: "/oss-dot-now-logo.svg", url: "https://oss.now" },
    { name: "Autumn", logo: "/autumn-logo.svg", url: "https://useautumn.com" },
  ];

  return (
    <section className="px-8 py-8">
      <div className="text-center space-y-1">
        <span
          className="text-xl font-extralight text-soft-silver leading-tight tracking-tight block"
          style={{
            letterSpacing: "-0.07em",
          }}
        >
          loved by the people behind
        </span>
        <div className="flex items-center justify-center gap-6 flex-wrap">
          {supporters.map((supporter) => (
            <Link
              key={supporter.name}
              href={supporter.url}
              target="_blank"
              rel="noopener noreferrer"
              className="opacity-60 hover:opacity-100 transition-opacity"
              aria-label={supporter.name}
            >
              <Image
                src={supporter.logo}
                alt={supporter.name}
                width={24}
                height={24}
                className="object-contain"
              />
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
