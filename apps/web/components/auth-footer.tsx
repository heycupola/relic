import Link from "next/link";

export function AuthFooter() {
  return (
    <p className="text-sm text-muted-foreground leading-relaxed">
      By signing in, you agree to the{" "}
      <Link href="/terms-of-service" className="underline hover:text-foreground transition-colors">
        Terms of Service
      </Link>{" "}
      and{" "}
      <Link href="/privacy-policy" className="underline hover:text-foreground transition-colors">
        Privacy Policy
      </Link>
      .
    </p>
  );
}
