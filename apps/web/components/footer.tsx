import Image from "next/image";

export function Footer() {
  return (
    <footer className="relative overflow-hidden border-t border-border">
      <div className="mx-auto max-w-6xl px-6 lg:px-12 h-16 flex items-center">
        <div className="flex items-center justify-between text-sm w-full">
          <p className="text-foreground/80">© {new Date().getFullYear()}</p>
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
