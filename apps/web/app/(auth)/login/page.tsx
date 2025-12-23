"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { GridContainer, Section } from "@/components/grid-container";
import { OAuthButton } from "@/components/oauth-button";
import { authClient } from "@/lib/auth";
import { isValidReturnUrl } from "@/lib/url";

export default function LoginPage() {
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get("returnUrl");
  const [isLoading, setIsLoading] = useState(false);

  const safeReturnUrl = isValidReturnUrl(returnUrl) ? returnUrl : "/";

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    try {
      if (safeReturnUrl) {
        await authClient.signIn.social({
          provider: "google",
          callbackURL: safeReturnUrl,
        });
      }
    } catch (error) {
      console.error("Google login failed:", error);
      setIsLoading(false);
    }
  };

  const handleGithubLogin = async () => {
    setIsLoading(true);
    try {
      if (safeReturnUrl) {
        await authClient.signIn.social({
          provider: "github",
          callbackURL: safeReturnUrl,
        });
      }
    } catch (error) {
      console.error("GitHub login failed:", error);
      setIsLoading(false);
    }
  };

  return (
    <GridContainer>
      <Section className="border-t-0 flex-1 flex items-center justify-center">
        <div className="w-full py-16">
          <div className="flex flex-col items-center gap-10">
            <div className="flex flex-col items-center gap-8">
              <Link href="/" className="flex items-center">
                <Image
                  src="/basic-logo.svg"
                  alt="Relic"
                  width={44}
                  height={44}
                  className="w-12 h-auto"
                />
              </Link>

              <div className="text-center space-y-3">
                <h1
                  className="text-3xl font-medium text-foreground"
                  style={{
                    fontFamily: "var(--font-space-grotesk, sans-serif)",
                    lineHeight: "1.1",
                    letterSpacing: "-0.05em",
                  }}
                >
                  sign in to relic
                </h1>
                <p
                  className="text-sm font-light text-soft-silver"
                  style={{
                    lineHeight: "1.4",
                    letterSpacing: "-0.02em",
                  }}
                >
                  encrypted client-side, zero-knowledge
                </p>
              </div>
            </div>

            <div className="w-full max-w-sm space-y-3">
              <OAuthButton
                provider="google"
                icon={
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <title>Google</title>
                    <path
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      fill="#4285F4"
                    />
                    <path
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      fill="#34A853"
                    />
                    <path
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      fill="#FBBC05"
                    />
                    <path
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      fill="#EA4335"
                    />
                  </svg>
                }
                onClick={handleGoogleLogin}
                disabled={isLoading}
              >
                Continue with Google
              </OAuthButton>

              <OAuthButton
                provider="github"
                icon={
                  <Image src="/github-logo.svg" alt="" width={20} height={20} className="w-5 h-5" />
                }
                onClick={handleGithubLogin}
                disabled={isLoading}
              >
                Continue with GitHub
              </OAuthButton>
            </div>

            <div className="flex items-center gap-4 text-xs font-light text-muted-foreground">
              <Link href="/privacy-policy" className="hover:text-foreground transition-colors">
                privacy
              </Link>
              <span className="text-border">•</span>
              <Link href="/terms-of-service" className="hover:text-foreground transition-colors">
                terms
              </Link>
            </div>
          </div>
        </div>
      </Section>
    </GridContainer>
  );
}
