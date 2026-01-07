import Link from "next/link";

export function AuthFooter() {
  return (
    <div className="flex items-center gap-4 text-xs font-light text-muted-foreground">
      <Link href="/privacy-policy" className="hover:text-foreground transition-colors">
        privacy
      </Link>
      <span className="text-border">•</span>
      <Link href="/terms-of-service" className="hover:text-foreground transition-colors">
        terms
      </Link>
    </div>
  );
}
