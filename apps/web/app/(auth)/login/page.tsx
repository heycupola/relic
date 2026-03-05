"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthFooter } from "@/components/auth-footer";
import { GoogleIcon } from "@/components/icons/google-icon";
import { OAuthButton } from "@/components/oauth-button";
import { authClient } from "@/lib/auth";
import { trackWebEvent } from "@/lib/posthog";
import { authHeadingStyle } from "@/lib/styles";
import { isValidReturnUrl } from "@/lib/url";

export default function LoginPage() {
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get("returnUrl");
  const [isLoading, setIsLoading] = useState(false);
  const [lastMethod, setLastMethod] = useState<string | null>(null);

  useEffect(() => {
    setLastMethod(authClient.getLastUsedLoginMethod());
  }, []);

  const safeReturnUrl = isValidReturnUrl(returnUrl) ? returnUrl : "/";

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    trackWebEvent("web_login_started", { provider: "google" });
    try {
      if (safeReturnUrl) {
        await authClient.signIn.social({
          provider: "google",
          callbackURL: safeReturnUrl,
        });
      }
    } catch (error) {
      console.error("Google login failed:", error);
      trackWebEvent("web_login_failed", { provider: "google" });
      setIsLoading(false);
    }
  };

  const handleGithubLogin = async () => {
    setIsLoading(true);
    trackWebEvent("web_login_started", { provider: "github" });
    try {
      if (safeReturnUrl) {
        await authClient.signIn.social({
          provider: "github",
          callbackURL: safeReturnUrl,
        });
      }
    } catch (error) {
      console.error("GitHub login failed:", error);
      trackWebEvent("web_login_failed", { provider: "github" });
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-dvh bg-background text-foreground flex items-center justify-center">
      <div className="w-full max-w-md px-4 py-10 sm:px-6 sm:py-16">
        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-6">
            <Link href="/" className="flex items-center">
              <Image
                src="/relic-logo-dark.svg"
                alt="Relic"
                width={40}
                height={40}
                className="h-10 w-auto dark:hidden"
              />
              <Image
                src="/relic-logo-light.svg"
                alt="Relic"
                width={40}
                height={40}
                className="h-10 w-auto hidden dark:block"
              />
            </Link>

            <h1 className="text-2xl font-medium text-foreground" style={authHeadingStyle}>
              Sign in to Relic
            </h1>
          </div>

          <div className="w-full space-y-3">
            <OAuthButton
              provider="google"
              icon={<GoogleIcon />}
              onClick={handleGoogleLogin}
              disabled={isLoading}
              lastUsed={lastMethod === "google"}
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
              lastUsed={lastMethod === "github"}
            >
              Continue with GitHub
            </OAuthButton>
          </div>

          <AuthFooter />
        </div>
      </div>
    </div>
  );
}
