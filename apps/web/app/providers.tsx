"use client";

import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { api } from "@repo/backend";
import { AutumnProvider } from "autumn-js/react";
import { ConvexReactClient, useQuery } from "convex/react";
import { usePathname, useRouter } from "next/navigation";
import { ThemeProvider as NextThemesProvider, type ThemeProviderProps } from "next-themes";
import { type ReactNode, useEffect } from "react";
import { authClient } from "@/lib/auth";
import { initPostHog } from "@/lib/posthog";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

if (!convexUrl) {
  throw new Error("NEXT_PUBLIC_CONVEX_URL is required");
}

const convex = new ConvexReactClient(convexUrl, {
  expectAuth: true,
});

export function PostHogProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    initPostHog();
  }, []);
  return <>{children}</>;
}

const ONBOARDING_GATED_PATHS = ["/dashboard", "/terms-of-service", "/privacy-policy"];

function OnboardingGuard() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const userData = useQuery(api.user.getCurrentUser, session?.user ? {} : "skip");

  useEffect(() => {
    if (!session?.user) return;
    if (userData === undefined) return;
    const isGatedPath =
      pathname === "/" || ONBOARDING_GATED_PATHS.some((p) => pathname.startsWith(p));
    if (!isGatedPath) return;
    if (userData.hasCompletedOnboarding === false) {
      router.replace("/onboarding");
    }
  }, [session, userData, pathname, router]);

  return null;
}

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  const autumnApi = "autumn" in api ? api.autumn : undefined;

  return (
    <ConvexBetterAuthProvider client={convex} authClient={authClient}>
      {autumnApi ? (
        <AutumnProvider convex={convex} convexApi={autumnApi}>
          <OnboardingGuard />
          {children}
        </AutumnProvider>
      ) : (
        <>
          <OnboardingGuard />
          {children}
        </>
      )}
    </ConvexBetterAuthProvider>
  );
}

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
