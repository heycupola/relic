import Link from "next/link";

export function AuthFooter() {
  return (
    <p className="text-sm text-muted-foreground leading-relaxed">
      By signing in, you agree to the{" "}
      <Link
        href="/terms-of-service"
        className="underline underline-offset-2 hover:text-foreground transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
      >
        Terms of Service
      </Link>{" "}
      and{" "}
      <Link
        href="/privacy-policy"
        className="underline underline-offset-2 hover:text-foreground transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
      >
        Privacy Policy
      </Link>
      .
    </p>
  );
}
