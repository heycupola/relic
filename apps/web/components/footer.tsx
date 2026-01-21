import Image from "next/image";
import Link from "next/link";

export function Footer() {
  return (
    <footer className="relative overflow-hidden border-t border-border">
      <div className="mx-auto max-w-6xl px-6 lg:px-12 py-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-sm">
          <div className="flex items-center gap-6">
            <p className="text-foreground/80">© {new Date().getFullYear()}</p>
            <div className="flex items-center gap-4">
              <Link
                href="https://github.com/heycupola/relic"
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground/80 transition-colors hover:text-foreground focus:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background rounded-sm px-1"
              >
                GitHub
              </Link>
              <Link
                href="https://x.com/heycupola"
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground/80 transition-colors hover:text-foreground focus:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background rounded-sm px-1"
              >
                𝕏
              </Link>
            </div>
          </div>
          <a
            href="https://cupo.la"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-foreground/80 transition-colors hover:text-foreground focus:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background rounded-sm px-1"
          >
            <span>Built by</span>
            <Image
              src="/cupola-dark.svg"
              alt="Cupola"
              width={100}
              height={20}
              className="h-5 w-auto dark:hidden"
            />
            <Image
              src="/cupola-light.svg"
              alt="Cupola"
              width={100}
              height={20}
              className="h-5 w-auto hidden dark:block"
            />
          </a>
        </div>
      </div>
    </footer>
  );
}
