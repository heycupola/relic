import { Star } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

export function Navbar() {
  return (
    <nav className="flex items-center justify-between px-8 py-6">
      <Link href="/" className="flex items-center">
        <Image src="/logo.svg" alt="Relic" width={64} height={64} className="w-16 h-auto" />
      </Link>

      <Link
        href="https://github.com/cupolabs/relic"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 px-4 py-2 rounded-md border border-border hover:bg-graphite-grey/50 transition-colors"
      >
        <Image
          src="/github-logo.svg"
          alt="GitHub"
          width={16}
          height={16}
          className="brightness-0 invert"
        />
        <span className="text-sm text-foreground">Github</span>
        <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
      </Link>
    </nav>
  );
}
