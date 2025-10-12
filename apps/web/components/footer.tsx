import Image from "next/image";
import Link from "next/link";

export function Footer() {
  return (
    <footer className="px-8 py-8">
      <div className="flex flex-col md:flex-row items-stretch justify-between gap-4">
        <div className="flex flex-col items-start justify-between">
          <Link
            href="https://cupolalabs.org"
            target="_blank"
            rel="noopener noreferrer"
            className="opacity-60 hover:opacity-100 transition-opacity"
          >
            <div>
              <Image
                src="/built-by-cupola-labs.svg"
                alt="Cupola Labs"
                width={128}
                height={32}
                className="h-8 w-auto"
              />
            </div>
          </Link>
          <p
            className="text-xs font-light text-soft-silver"
            style={{
              lineHeight: "auto",
              letterSpacing: "-0.05em",
            }}
          >
            © 2025 Cupola Labs, LLC. All Rights Reserved
          </p>
        </div>

        <div className="flex flex-col items-start md:items-end gap-2">
          <Link
            href="/privacy-policy"
            className="text-xs font-light text-muted-foreground hover:text-foreground transition-colors"
            style={{
              lineHeight: "auto",
              letterSpacing: "-0.05em",
            }}
          >
            privacy policy
          </Link>
          <Link
            href="/terms-of-service"
            className="text-xs font-light text-muted-foreground hover:text-foreground transition-colors"
            style={{
              lineHeight: "auto",
              letterSpacing: "-0.05em",
            }}
          >
            terms of service
          </Link>

          <div className="flex items-center gap-3">
            <Link
              href="https://discord.com"
              target="_blank"
              rel="noopener noreferrer"
              className="opacity-60 hover:opacity-100 transition-opacity"
              aria-label="Discord"
            >
              <Image src="/discord-logo.svg" alt="Discord" width={16} height={16} />
            </Link>
            <Link
              href="https://x.com"
              target="_blank"
              rel="noopener noreferrer"
              className="opacity-60 hover:opacity-100 transition-opacity"
              aria-label="X (Twitter)"
            >
              <Image src="/x-logo.svg" alt="X" width={12} height={12} />
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
