import Image from "next/image";

export function Footer() {
  return (
    <footer className="relative overflow-hidden border-t border-border">
      <div className="mx-auto max-w-6xl px-6 py-16 lg:px-12">
        <div className="flex items-center justify-between text-sm">
          <p className="text-foreground/80">© 2025</p>
          <a
            href="https://cupolalabs.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-foreground/80 transition-colors hover:text-foreground focus:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background rounded-sm px-1"
          >
            <span>Built by</span>
            <Image
              src="/cupolalabs-light.svg"
              alt="Cupola Labs"
              width={100}
              height={20}
              className="h-5 w-auto dark:hidden"
            />
            <Image
              src="/cupolalabs-dark.svg"
              alt="Cupola Labs"
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
