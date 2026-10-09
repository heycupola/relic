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
import { getSafeReturnPath } from "@/lib/url";

export default function LoginPage() {
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get("returnUrl");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastMethod, setLastMethod] = useState<string | null>(null);

  useEffect(() => {
    setLastMethod(authClient.getLastUsedLoginMethod());
  }, []);

  const callbackURL = getSafeReturnPath(returnUrl) ?? "/dashboard";

  const signIn = async (provider: "google" | "github") => {
    setIsLoading(true);
    setError(null);
    trackWebEvent("web_login_started", { provider });
    try {
      const result = await authClient.signIn.social({ provider, callbackURL });
      if (result.error) throw new Error(result.error.message);
    } catch (err) {
      console.error(`${provider} login failed:`, err);
      trackWebEvent("web_login_failed", { provider });
      setError("Sign-in didn't go through. Please try again.");
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-dvh bg-background text-foreground flex items-center justify-center">
      <div className="w-full max-w-md px-4 py-10 sm:px-6 sm:py-16">
        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-6">
            <Link
              href="/"
              className="flex w-fit items-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
            >
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
              onClick={() => void signIn("google")}
              disabled={isLoading}
              lastUsed={lastMethod === "google"}
            >
              Continue with Google
            </OAuthButton>

            <OAuthButton
              provider="github"
              icon={
                <>
                  <Image
                    src="/github-logo-dark.svg"
                    alt=""
                    width={20}
                    height={20}
                    className="w-5 h-5 dark:hidden"
                  />
                  <Image
                    src="/github-logo.svg"
                    alt=""
                    width={20}
                    height={20}
                    className="w-5 h-5 hidden dark:block"
                  />
                </>
              }
              onClick={() => void signIn("github")}
              disabled={isLoading}
              lastUsed={lastMethod === "github"}
            >
              Continue with GitHub
            </OAuthButton>
            {error && (
              <p role="alert" className="text-sm text-red-700 dark:text-red-400">
                {error}
              </p>
            )}
          </div>

          <AuthFooter />
        </div>
      </div>
    </div>
  );
}
